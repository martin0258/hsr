if (Meteor.isClient) {
  Meteor.startup(function () {
    // Clear session
    Session.keys = {};
  });
  
  // For long press next and prev caption
  var intervalId;

  var navigateCaption = function (operation) {
    var offset = 0;
    if (operation == 'next') offset = 1;
    else if (operation == 'prev') offset = -1;
    else offset = 0;

    var captions = Session.get('captions');
    var captionIdx = Session.get('captionIdx');
    var newCaptionIdx = captionIdx + offset;
    if (newCaptionIdx < 0 || newCaptionIdx >= captions.length) return;
    var newCaption = captions[newCaptionIdx];
    Session.set('captionIdx', newCaptionIdx);
    Session.set('curCaption', newCaption);

    // Reset input and result
    $('#sentence').val('');
    $("#correct").hide();
    $("incorrect").show();
    Session.set('wordComparisonResult', undefined);

    window.clearTimeout(timeoutId);
    player.pauseVideo();
    player.seekTo(newCaption.start, true);
    player.playVideo();
  };
  var nextCaption = function () { navigateCaption('next'); };
  var prevCaption = function () { navigateCaption('prev'); };
  var findWordsInLCS = function (s1, s2) {
    // Find a longest common subsequence between two string arrays
    // And return an array whose length is equal to length of first array
    // Indicate the index of array element that compose lcs
    // Reference: http://www.csie.ntnu.edu.tw/~u91029/LongestCommonSubsequence.html

    // Initialize DP table to calculate length of lcs
    // And array to store source of lcs answer
    // Reverse to find the matched word closest to start of sentence
    var words1 = s1.slice().reverse();
    var words2 = s2.slice().reverse();
    words1.unshift('');
    words2.unshift('');
    var lcsDP = new Array(words1.length);
    var prev = new Array(words1.length);
    for (var i = 0; i < words1.length; i++) {
      lcsDP[i] = new Array(words2.length);
      prev[i] = new Array(words2.length);
    }

    // Calculate lcs length with DP
    for (var i = 0; i < words1.length; i++) lcsDP[i][0] = 0;
    for (var j = 0; j < words2.length; j++) lcsDP[0][j] = 0;
    for (var i = 1; i < words1.length; i++)
      for (var j = 1; j < words2.length; j++) {
        if (words1[i] == words2[j]) {
          lcsDP[i][j] = lcsDP[i-1][j-1] + 1;
          prev[i][j] = 'left-top';
        } else {
          if (lcsDP[i-1][j] < lcsDP[i][j-1]) {
            lcsDP[i][j] = lcsDP[i][j-1];
            prev[i][j] = 'left';
          } else {
            lcsDP[i][j] = lcsDP[i-1][j];
            prev[i][j] = 'top';
          }
        }
      }
    // Find elements that compose lcs
    var wordComparisonResult = new Array(words1.length);
    for (var i = 0 ; i < wordComparisonResult.length; i++) wordComparisonResult[i] = false;
    var findWordInLCS = function (i, j) {
      if (i==0 || j==0) return;
      if (prev[i][j] == 'left-top') {
        findWordInLCS(i-1, j-1);
        wordComparisonResult[i] = true;
      } else if (prev[i][j] == 'top') findWordInLCS(i-1, j);
      else if (prev[i][j] == 'left') findWordInLCS(i, j-1);
    };
    findWordInLCS(words1.length-1, words2.length-1);

    return wordComparisonResult.slice(1).reverse();
  };

  var spacesRe = /\s+/;

  Template.playground.events({
    'keyup #sentence': function (event, template) {
      // Hide result if the keypress is not ENTER
      //if (event.which != 13) $(".result").hide();
      template.find('#check').click();
    },
    'keydown #sentence': function (event, template) {
      // Repeat if pressing Ctrl+Enter
      // Reference: http://stackoverflow.com/a/9343095
      if ((event.keyCode == 10 || event.keyCode == 13) && event.ctrlKey) {
        $('#repeat').click();
      } else if (event.keyCode == 9) {
        // When I press Tab key
        // Then insert the first word in answer that is not in LCS
        template.find('#check').click();
        var wordComparisonResult = Session.get('wordComparisonResult');
        var caption = Session.get('curCaption');
        var captionWords = caption.text.split(spacesRe);
        captionWords = captionWords.slice(1, captionWords.length-1);
        var firstUnmatchedWordIdx = wordComparisonResult.indexOf(false);
        if (firstUnmatchedWordIdx != -1) {
          var firstUnmatchedWord = captionWords[firstUnmatchedWordIdx];
          var textbox = event.currentTarget;
          var caretPos = textbox.selectionStart;
          var textboxVal = textbox.value;
          var wordToAdd = firstUnmatchedWord + ' ';
          // Add word where cursor is
          // Reference: http://stackoverflow.com/a/15977052
          textbox.value = textboxVal.substring(0, caretPos) + wordToAdd + textboxVal.substring(caretPos);
          // Place cursor at the end of word to add
          textbox.selectionStart = caretPos + wordToAdd.length;
          textbox.selectionEnd = caretPos + wordToAdd.length;
        }
        event.preventDefault();
        return false;
      }
    },
    'submit #sentence-form': function (event, template) {
      event.preventDefault();
      if ($("#correct").is(":visible")) {
        nextCaption();
        return;
      }
      template.find('#check').click();
    },
    'click #nextCaption': nextCaption,
    'click #prevCaption': prevCaption,
    'mousedown #nextCaption': function () {
      // Start fast forward
      intervalId = setInterval(nextCaption, 100);
    },
    'mousedown #prevCaption': function () {
      // Start fast backward
      intervalId = setInterval(prevCaption, 100);
    },
    'mouseup #nextCaption, mouseup #prevCaption, mouseout #nextCaption, mouseout #prevCaption': function () {
      // Stop fast forward or backward
      clearInterval(intervalId);
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
      // Ignore one or more white spaces between words
      var actualWords = inputSentence.split(spacesRe);
      var expectedWords = expectedSentence.split(spacesRe);
      
      // Remove first and last words since they are given
      expectedWords.splice(0, 1);
      expectedWords.splice(expectedWords.length - 1, 1);
      
      // Compare each word and store result
      var wordComparisonResult = findWordsInLCS(expectedWords, actualWords);
      Session.set('wordComparisonResult', wordComparisonResult);

      inputSentence = actualWords.join(' ');
      expectedSentence = expectedWords.join(' ');
      console.log(inputSentence);
      console.log(expectedSentence);
      // Not sure why == would always result in false
      // So we use lcaleCompare instead
      isCorrect = inputSentence.localeCompare(expectedSentence)==0;
      if (isCorrect) {
        $("#incorrect").hide();
        $("#correct").show();
      }
      else {
        $("#correct").hide();
        $("#incorrect").show();
      }
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
      return caption!=undefined ? caption.text.split(spacesRe)[0] : '';
    },
    last: function () {
      var caption = Session.get('curCaption');
      return caption!=undefined ? caption.text.split(spacesRe).pop() : '';
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
        var captionWords = caption.text.split(spacesRe);
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
          $('#sentence').val('');
          $("#correct").hide();
          Session.set('wordComparisonResult', undefined);
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
