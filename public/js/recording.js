'use strict';

// eslint-disable-next-line no-undef
const session = OT.initSession(apiKey, sessionId);
const publisher = OT.initPublisher('publisher', {
  insertMode: 'append',
  width: '100%',
  height: '100%',
});
let archiveId = null;
let videoUrl = null;

function disableForm() {
  $('.archive-options-fields').attr('disabled', 'disabled');
}

function enableForm() {
  $('.archive-options-fields').removeAttr('disabled');
}

function positionStreams() {
  const $focusElement = $('.focus');
  if ($('#streams').hasClass('vertical')) {
    $('#streams').children().css('top', '0');
    $focusElement.appendTo('#streams');
    $focusElement.css('top', `${-20 * ($('#streams').children().size() - 1)}%`);
  } else {
    $focusElement.prependTo('#streams');
    $focusElement.css('top', '0');
  }
}

function setFocus(focusStreamId) {
  const otherStreams = $.map($('#streams').children(), (element) => {
    const streamId = (element.id === 'publisher' && publisher.stream) ? publisher.stream.streamId
      : element.id;
    if (streamId !== focusStreamId) {
      $(`#${element.id}`).removeClass('focus');
      return streamId;
    }
    return null;
  });

  $.post('/focus', {
    focus: focusStreamId,
    otherStreams,
  }).done(() => {
    console.log('Focus changed.');
  }).fail((jqXHR, textStatus, errorThrown) => {
    console.error('Stream class list error:', errorThrown);
  });

  $('.focus').removeClass('focus');
  const $focusElement = (publisher.stream && publisher.stream.streamId === focusStreamId)
    ? $('#publisher') : $(`#${focusStreamId}`);
  $focusElement.addClass('focus');
  session.signal({
    type: 'focusStream',
    data: focusStreamId,
  });
  positionStreams();
}

function createFocusClick(elementId, focusStreamId) {
  $(`#${elementId}`).click(() => {
    setFocus(focusStreamId);
  });
}

// eslint-disable-next-line no-undef
if (layout === 'verticalPresentation') {
  $('#streams').addClass('vertical');
}

function getVideoUrl() {
  if (archiveId) {
    console.log('TRYING TO GET VIDEO URL');
    $.ajax({
      // eslint-disable-next-line no-undef
      url: `${getVideoBaseUrl}/video/${archiveId}`,
      success(data) {
        console.log(data);
        console.log(archiveId);
        archiveId = null;
        videoUrl = data.videoUrl;
        console.log(videoUrl);
        $('#video-container').html(`<source src="${videoUrl}" type="video/mp4"></source>`);
        $('#video-container').show();
        $('#video-container').load();
      },
      error() {
        console.log('An error occurred during polling');
        videoUrl = null;
        getVideoUrl();
      },
      timeout: 60 * 1000,
    });
  }
}

// eslint-disable-next-line no-undef
session.connect(token, (err) => {
  if (err) {
    alert(err.message || err);
  }
  session.publish(publisher);
});

publisher.on('streamCreated', () => {
  createFocusClick(publisher.id, publisher.stream.streamId);
  positionStreams();
});

session.on('streamCreated', (event) => {
  const { streamId } = event.stream;
  const $streamContainer = $('<div></div>');
  $streamContainer.attr('id', event.stream.id);
  $('#streams').append($streamContainer);
  const subscriber = session.subscribe(event.stream, streamId, {
    insertMode: 'append',
    width: '100%',
    height: '100%',
  });

  // eslint-disable-next-line no-undef
  if (streamId === focusStreamId) {
    setFocus(streamId);
  }
  createFocusClick(subscriber.id, streamId);
  positionStreams();
});

session.on('streamDestroyed', (event) => {
  const $streamElem = $(`#${event.stream.id}`);
  if ($streamElem.hasClass('focus')) {
    setFocus(publisher.stream.streamId);
  }
  $streamElem.remove();
  positionStreams();
});

session.on('archiveStarted', (event) => {
  archiveId = event.id;
  console.log('ARCHIVE STARTED');
  $('.start').prop('disabled', true);
  disableForm();
  setTimeout(() => {
    archiveId = null;
  }, 60 * 1000);
  getVideoUrl();
});

session.on('archiveStopped', () => {
  console.log('ARCHIVE STOPPED');
  $('.start').prop('disabled', false);
  enableForm();
});

function getFormData($form) {
  const unindexedArray = $form.serializeArray();
  const indexedArray = {};

  $.map(unindexedArray, (n) => {
    indexedArray[n.name] = n.value;
  });

  return indexedArray;
}

$(document).ready(() => {
  $('.start').click(() => {
    $('#video-container').hide();
    const options = getFormData($('.archive-options'));
    // eslint-disable-next-line no-undef
    options.sessionId = sessionId;
    disableForm();
    const params = Object
      .entries(options)
      .reduce((result, [key, value], index) => (
        `${result}${index ? '&' : ''}${key}=${value}`
      ), '');
    $.post('/start', params)
      .fail(enableForm);
  }).prop('disabled', false);
  $('.toggle-layout').click(() => {
    if ($('#streams').hasClass('vertical')) {
      $('#streams').removeClass('vertical');
    } else {
      $('#streams').addClass('vertical');
    }

    positionStreams();

    const newLayoutClass = $('#streams').hasClass('vertical') ? 'verticalPresentation'
      : 'horizontalPresentation';

    if (archiveId) {
      $.post(`archive/${archiveId}/layout`, {
        type: newLayoutClass,
      }).done(() => {
        console.log('Archive layout updated.');
      }).fail((jqXHR) => {
        console.error('Archive layout error:', jqXHR.responseText);
      });
    }

    session.signal({
      type: 'layoutClass',
      data: newLayoutClass,
    });
  });
});
