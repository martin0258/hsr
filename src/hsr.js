if (Meteor.isClient) {
  Meteor.startup(function () {
    // Clear session
    Session.keys = {};
  });
  
  Template.playground.events({
    'keyup #sentence': function (event) {
      // Hide result if the keypress is not ENTER
      if (event.which != 13) $(".result").hide();
    },
    'submit #sentence-form': function (event, template) {
      event.preventDefault();
      if ($("#correct").is(":visible")) {
        template.find('#next').click();
        return;
      }
      else if ($("#incorrect").is(":visible")) {
        template.find('#repeat').click();
        return;
      }
      template.find('#check').click();
    },
    'click #next': function (event, template) {
      var captions = Session.get('captions');
      var captionIdx = Session.get('captionIdx');
      var nextCaption = captions[captionIdx+1];
      Session.set('captionIdx', captionIdx+1);
      Session.set('curCaption', nextCaption);

      // Reset input and result
      $('#sentence').val('');
      $(".result").hide();
      Session.set('wordComparisonResult', undefined);

      window.clearTimeout(timeoutId);
      player.pauseVideo();
      player.seekTo(nextCaption.start, true);
      player.playVideo();
    },
    'click #check': function (event, template) {
      var isCorrect = true;
      var inputSentence = template.find("#sentence").value.trim();
      var expectedSentence = Session.get('curCaption').text.trim();
      // Case insensitive comparision
      inputSentence = inputSentence.toLowerCase();
      expectedSentence = expectedSentence.toLowerCase();
      // Remove characters that are not English or number or white space
      inputSentence = inputSentence.replace(/[^a-z0-9 ]/g, '');
      expectedSentence = expectedSentence.replace(/[^a-z0-9 ]/g, '');
      // Ignore white spaces
      var actualWords = inputSentence.split(' ');
      var expectedWords = expectedSentence.split(' ');
      
      // Remove first and last words since they are given
      expectedWords.splice(0, 1);
      expectedWords.splice(expectedWords.length - 1, 1);
      
      // Compare each word and store result
      var wordComparisonResult = [];
      for (var i = 0; i < expectedWords.length; i++) {
        var result = i < actualWords.length && expectedWords[i]==actualWords[i];
        wordComparisonResult.push(result);
      }
      Session.set('wordComparisonResult', wordComparisonResult);

      inputSentence = actualWords.join(' ');
      expectedSentence = expectedWords.join(' ');
      // Not sure why == would always result in false
      // So we use lcaleCompare instead
      isCorrect = inputSentence.localeCompare(expectedSentence)==0;
      $(".result").hide();
      if (isCorrect) $("#correct").show();
      else $("#incorrect").show();
    },
    'click #repeat': function () {
      var caption = Session.get('curCaption');
      window.clearTimeout(timeoutId);
      player.pauseVideo();
      player.seekTo(caption.start, true);
      player.playVideo();
    }
  });
  
  Template.playground.helpers({
    hasValidUrl: function () {
      var hasValidUrl = Session.get('hasValidUrl');
      return hasValidUrl!=undefined && hasValidUrl ? true : false;
    },
    first: function () {
      var caption = Session.get('curCaption');
      return caption!=undefined ? caption.text.split(' ')[0] : ''; 
    },
    last: function () {
      var caption = Session.get('curCaption');
      return caption!=undefined ? caption.text.split(' ').pop() : '';
    },
    solution: function () {
      // Set input textbox width as solution's width
      setTimeout(function(){
        var solutionWidth = $('#solution').width();
        if (solutionWidth != 0) $('#sentence').width(solutionWidth);
      }, 100);

      var solution = '';
      var caption = Session.get('curCaption');
      if (caption != undefined) {
        var captionWords = caption.text.split(' ');
        // Remove first and last words since they are given
        captionWords.splice(0, 1);
        captionWords.splice(captionWords.length - 1, 1);

        // Show words in solution that are correct
        // Hide words in solution that are incorrect
        var wordComparisonResult = Session.get('wordComparisonResult');
          if (wordComparisonResult != undefined) {
          for (var i = 0; i < captionWords.length; i++) {
            var wordClass = wordComparisonResult[i] ? 'correct' : 'incorrect';
            captionWords[i] = '<span class="' + wordClass + '">' + captionWords[i] + '</span>';
          }
        }

        solution = captionWords.join(' ');
      }
      return solution;
    },
    captionIdx: function () {
      var captionIdx = Session.get('captionIdx');
      return captionIdx != undefined ? captionIdx + 1 : 0;
    },
    numCaptions: function () {
      var captions = Session.get('captions');
      return captions != undefined ? captions.length : 0;
    }
  });
  
  // YouTube API will call onYouTubeIframeAPIReady() when API ready.
  // Make sure it's a global variable.
  // Reference: https://github.com/adrianliaw/meteor-youtube-iframe-api
  var player, timeoutId;
  onYouTubeIframeAPIReady = function() {

    // New Video Player, the first argument is the id of the div.
    // Make sure it's a global variable.
    player = new YT.Player("player", {
      height: "0",
      width: "0",
      videoId: "",
      playerVars: { 'rel':0 },
      events: {
        onStateChange: function(event) {
          if (event.data == YT.PlayerState.PLAYING) {
            // Pause the video at the end of current sentence
            // Do not pause if it is the last sentence
            var caption = Session.get('curCaption');
            var captions = Session.get('captions');
            var captionIdx = Session.get('captionIdx');
            if (captionIdx != captions.length-1)
              timeoutId = setTimeout(function(){ player.pauseVideo(); }, caption.duration);
          }
        }
      }
    });
  };

  YT.load();

  Template.body.events({
    "click #sample": function (event, template) {
      var sampleUrl = "https://tw.voicetube.com/videos/5048";
      template.find("#url").value = sampleUrl;
      template.find("#source-submit").click();
    },
    "submit #source": function (event) {
      // Prevent default browser form submit
      event.preventDefault();

      // Get value from form element
      var url = event.target.url.value;

      // Get VoiceTube data from url
      Meteor.call('getVoiceTubeData', url, function (error, result){
        if (error) {
          console.log('error', error);
          alert('無法載入影片，請檢查影片網址是否正確。');
        }
        else {
          Session.set('hasValidUrl', true);
          Session.set('captionIdx', 0);
          Session.set('youtubeId', result.youtubeId);
          Session.set('captions', result.captions);
          Session.set('curCaption', result.captions[0]);
          
          // Play the video
          player.setSize(600, 400);
          player.loadVideoById(result.youtubeId, result.captions[0].start);
        }
      });
    }
  });
}

if (Meteor.isServer) {
  Meteor.startup(function () {
    var cheerio = Meteor.npmRequire('cheerio');
    
    Meteor.methods({
	    getVoiceTubeData: function (url) {
		    // Send HTTP request to get web page content
		    // We need to set user agent to avoid blocking
		    // Reference: https://www.youtube.com/watch?v=QA0_0SPd3P8
		    // Reference: http://stackoverflow.com/a/16684019
		    // Reference: http://stackoverflow.com/a/16627277
		    var result = Meteor.http.get(url, {
		      headers: {'User-Agent': 'Mozilla/5.0'}
		    });
		    $ = cheerio.load(result.content);
		    
		    // Get YouTube ID
		    // Reference: http://stackoverflow.com/a/8977722
		    // Example of image url: https://cdn.voicetube.com/assets/thumbnails/61zQW7p5bzw.jpg
		    var imageUrl = $('meta[property="og:image"]').attr('content');
		    var youtubeId = imageUrl.split('/').pop().split('.')[0];
		    
		    // Get captions and store them line by line
		    var captionsSrc = $('td[captions_detail_id]');
		    var captions = [];
		    captionsSrc.each(function (index) {
		      var start = $(this).find('span[start]').attr('start');
		      var text = $(this).text().trim();
		      captions.push({'start':parseFloat(start), 'duration':0, 'text':text});
		    });
		    // Calculate duration (ms) of each sentence
		    // But we cannot calculate it for the last sentence
		    for (var i = 0; i < captions.length-1; i++) {
		      var duration = captions[i+1].start - captions[i].start;
		      captions[i].duration = duration * 1000;
		    }
		    
		    return {'youtubeId': youtubeId, 'captions': captions};
	    }
	  });
  });
}
