/* eslint-disable no-console, no-path-concat */

// Dependencies
const express = require('express');
const bodyParser = require('body-parser');
const OpenTok = require('opentok');
const Longpoll = require("express-longpoll");

const app = express();
const longpoll = Longpoll(app);

var opentok;
var apiKey = process.env.API_KEY || '46838614';
var apiSecret = process.env.API_SECRET || '53f3c5ebf4fe24a30e54b2b82578b08118cb7208';

// Verify that the API Key and API Secret are defined
if (!apiKey || !apiSecret) {
  console.log('You must specify API_KEY and API_SECRET environment variables');
  process.exit(1);
}

// Initialize the express app
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({
  extended: true
}));

// Initialize OpenTok
opentok = new OpenTok(apiKey, apiSecret);

// Create a session and store it in the express app
const session = opentok.createSession({ mediaMode: 'routed' }, function (err, session) {
  if (err) throw err;
  app.set('sessionId', session.sessionId);
  app.set('layout', 'horizontalPresentation');
  // We will wait on starting the app until this is done
  init();
});

// Starts the express app
function init() {
  app.listen(process.env.PORT || 3000, function () {
    console.log('You\'re app is now ready at http://localhost:3000/');
  });
}

app.get('/', function (req, res) {
  res.render('index.ejs');
});

app.post('/video', (req, res) => {
  const { body = {} } = req;
  const  { id: archiveId, url: videoUrl } = body;
  longpoll.publish(`/video/${archiveId}`, { videoUrl });
  res.end();
});

app.get('/host', function (req, res) {
  var sessionId = app.get('sessionId');
  // generate a fresh token for this client
  var token = opentok.generateToken(sessionId, {
    role: 'moderator',
    initialLayoutClassList: ['focus']
  });

  res.render('host.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token,
    focusStreamId: app.get('focusStreamId') || '',
    layout: app.get('layout'),
    videoUrl: '',
  });
});

app.get('/participant', function (req, res) {
  var sessionId = app.get('sessionId');
  // generate a fresh token for this client
  var token = opentok.generateToken(sessionId, { role: 'moderator' });

  res.render('participant.ejs', {
    apiKey: apiKey,
    sessionId: sessionId,
    token: token,
    focusStreamId: app.get('focusStreamId') || '',
    layout: app.get('layout')
  });
});

app.get('/history', function (req, res) {
  var page = req.param('page') || 1;
  var offset = (page - 1) * 5;
  opentok.listArchives({ offset: offset, count: 5 }, function (err, archives, count) {
    if (err) return res.send(500, 'Could not list archives. error=' + err.message);
    return res.render('history.ejs', {
      archives: archives,
      showPrevious: page > 1 ? ('/history?page=' + (page - 1)) : null,
      showNext: (count > offset + 5) ? ('/history?page=' + (page + 1)) : null
    });
  });
});

app.get('/download/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  opentok.getArchive(archiveId, function (err, archive) {
    if (err) return res.send(500, 'Could not get archive ' + archiveId + '. error=' + err.message);
    return res.redirect(archive.url);
  });
});

app.post('/start', function (req, res) {
  var hasAudio = (req.param('hasAudio') !== undefined);
  var hasVideo = (req.param('hasVideo') !== undefined);
  var archiveOptions = {
    name: 'Mati liveness check',
    hasAudio: hasAudio,
    hasVideo: hasVideo,
    outputMode: 'composed',
    layout: { type: 'horizontalPresentation' }
  };

  opentok.startArchive(app.get('sessionId'), archiveOptions, function (err, archive) {
    if (err) {
      return res.send(
        500,
        'Could not start archive for session ' + app.get('sessionId') + '. error=' + err.message
      );
    }
    setTimeout(() => {
      stopArchive(archive.id);
    }, 7000);
    longpoll.create(`/video/${archive.id}`);
    return res.json(archive);
  });


});

function stopArchive(archiveId) {
  opentok.stopArchive(archiveId, function (err, archive) {
    if (err) return console.log('Could not stop archive ' + archiveId + '. error=' + err.message);
    return archive;
  });
}

app.get('/stop/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  const archive = stopArchive(archiveId)
  return res.json(archive);
});

app.get('/delete/:archiveId', function (req, res) {
  var archiveId = req.param('archiveId');
  opentok.deleteArchive(archiveId, function (err) {
    if (err) return res.send(500, 'Could not stop archive ' + archiveId + '. error=' + err.message);
    return res.redirect('/history');
  });
});

app.post('/archive/:archiveId/layout', function (req, res) {
  var archiveId = req.param('archiveId');
  var type = req.body.type;
  app.set('layout', type);
  opentok.setArchiveLayout(archiveId, type, null, function (err) {
    if (err) {
      return res.send(500, 'Could not set layout ' + type + '. Error: ' + err.message);
    }
    return res.send(200, 'OK');
  });
});

app.post('/focus', function (req, res) {
  var otherStreams = req.body.otherStreams;
  var focusStreamId = req.body.focus;
  var classListArray = [];
  var i;

  if (otherStreams) {
    for (i = 0; i < otherStreams.length; i++) {
      classListArray.push({
        id: otherStreams[i],
        layoutClassList: []
      });
    }
  }
  classListArray.push({
    id: focusStreamId,
    layoutClassList: ['focus']
  });
  app.set('focusStreamId', focusStreamId);
  opentok.setStreamClassLists(app.get('sessionId'), classListArray, function (err) {
    if (err) return res.send(500, 'Could not set class lists. Error:' + err.message);
    return res.send(200, 'OK');
  });
});
