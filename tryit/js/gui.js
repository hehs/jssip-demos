window.GUI = {

  phoneCallButtonPressed : function() {
    var uri;

    if (!(uri = phone_dialed_number_screen.val())) {
      return false;
    }

    phone_dialed_number_screen.val("");

    call = GUI.jssipCall(uri);
  },


  phoneChatButtonPressed : function() {
    var user, uri, session;

    if (!(uri = phone_dialed_number_screen.val())) {
      return false;
    }

    uri = JsSIP.utils.normalizeUri(uri, MyPhone.configuration.domain);
    if (uri) {
      user = JsSIP.grammar.parse(uri, 'SIP_URI').user;
    } else {
      alert('Invalid target');
      return;
    }

    phone_dialed_number_screen.val("");

    session = GUI.getSession(uri);

    // If this is a new session create it without call.
    if (!session) {
      session = GUI.createSession(user, uri);
      GUI.setCallSessionStatus(session, "inactive");
    }
    // If it exists, do nothing.

    $(session).find(".chat input").focus();
  },


  /*
   * JsSIP.UA new_session event listener
   */
  new_session : function(e) {
    var session, call, message, display_name, uri;
    message = e.data.request;
    call = e.data.session;
    uri = call.remote_identity;
    session = GUI.getSession(uri);

    if (call.direction === 'incoming') {
      display_name = message.s('from').user;

      // If this is a new session create it with call status "incoming".
      if (!session) {
        session = GUI.createSession(display_name, uri);
        session.call = call;
        GUI.setCallSessionStatus(session, "incoming");
      }
      // If the session already exists but has no call, start it and set to "incoming".
      else if ($(session).find(".call").hasClass("inactive")) {
        session.call = call;
        GUI.setCallSessionStatus(session, "incoming");
      }
      // If the session exists with active callreject it.
      else {
        call.terminate();
        return false;
      }
    } else {
      display_name = message.ruri;

      // If this is a new session create it with call status "trying".
      if (!session) {
        session = GUI.createSession(display_name, uri);
        session.call = call;
        GUI.setCallSessionStatus(session, "trying");
      }
      // If the session already exists but has no call, start it and set to "trying".
      else if ($(session).find(".call").hasClass("inactive")) {
        session.call = call;
        GUI.setCallSessionStatus(session, "trying");
      }
      // If the session exists just associate the call to it.
      else {
        session.call = call;
        GUI.setCallSessionStatus(session, "trying");
      }
    }

    session.call.on('failed',function(e) {
      var cause, response;

      cause = e.data.cause;

      if (e.data.originator === 'remote') {
        cause = e.data.cause;
        document.title = PageTitle;
        if (cause && cause.match("SIP;cause=200", "i")) {
          GUI.setCallSessionStatus(session, "answered_elsewhere");
          GUI.removeSession(session, 1500);
        }
        else {
          GUI.setCallSessionStatus(session, "terminated", cause);
          GUI.removeSession(session, 1000);
        }
      } else {
        response = e.data.response;
        GUI.setCallSessionStatus(session, 'terminated', cause);
        soundPlayer.setAttribute("src", "sounds/outgoing-call-rejected.wav");
        soundPlayer.play();
        GUI.removeSession(session, 500);
      }
    });
    session.call.on('ended', function(e) {
      var cause = e.data.cause;
      switch (cause) {
        default:
          (function(){
            document.title = PageTitle;
            GUI.setCallSessionStatus(session, "terminated", cause);
            GUI.removeSession(session, 1500);
          })();
          break;
      }
    });

    call.on('started',function(e){
        GUI.setCallSessionStatus(session, 'answered');
    });

    call.on('progress',function(e){
      if (e.data.originator === 'remote') {
        GUI.setCallSessionStatus(session, 'in-progress');
      }
    });

    $(session).find(".chat input").focus();
  },


  /*
   * JsSIP.UA new_message event listener
   */
  new_message : function(e) {
    var display_name, uri, text, session, request;
    message = e.data.message;
    uri = message.remote_identity;
    session = GUI.getSession(uri);

    if (message.direction === 'incoming') {
      display_name = e.data.request.s('from').user;
      text = e.data.request.body;

      // If this is a new session create it with call status "inactive", and add the message.
      if (!session) {
        session = GUI.createSession(display_name, uri);
        GUI.setCallSessionStatus(session, "inactive");
      }

      GUI.addChatMessage(session, "peer", text);
      $(session).find(".chat input").focus();
    } else {
      display_name = e.data.request.ruri;
      message.on('succeeded', function(e){ });
      message.on('failed', function(e){
        var response = e.data.response;
        GUI.addChatMessage(session, "error", response.status_code.toString() + " " + response.reason_phrase);
      });
    }
  },


  /*
   * Esta función debe ser llamada por jssip al recibir un MESSAGE
   * de tipo application/im-iscomposing+xml,
   * y debe pasar como parámetro el From URI (sip:user@domain) y otro
   * parámetro active que es:
   * - true: es un evento "iscomposing active"
   * - false: es un evento "iscomposing idle"
   */
  phoneIsComposingReceived : function(uri, active) {
    var session = GUI.getSession(uri);

    // If a session does not exist just ignore it.
    if (!session)
      return false;

    var chatting = $(session).find(".chat > .chatting");

    // If the session has no chat ignore it.
    if ($(chatting).hasClass("inactive"))
      return false;

    if (active)
      $(session).find(".chat .iscomposing").show();
    else
      $(session).find(".chat .iscomposing").hide();
  },


  /*
   * Busca en las sessions existentes si existe alguna con mismo peer URI. En ese
   * caso devuelve el objeto jQuery de dicha session. Si no, devuelve false.
   */
  getSession : function(uri) {
    var session_found = null;

    $("#sessions > .session").each(function(i, session) {
      if (uri == $(this).find(".peer > .uri").text()) {
        session_found = session;
        return false;
      }
    });

    if (session_found)
      return session_found;
    else
      return false;
  },


  createSession : function(display_name, uri) {
    var session_div = $('\
    <div class="session"> \
      <div class="close"></div> \
      <div class="container"> \
        <div class="peer"> \
          <span class="display-name">' + display_name + '</span> \
          <span>&lt;</span><span class="uri">' + uri + '</span><span>&gt;</span> \
        </div> \
        <div class="call inactive"> \
          <div class="button dial"></div> \
          <div class="button hangup"></div> \
          <div class="button hold"></div> \
          <div class="button resume"></div> \
          <div class="call-status"></div> \
        </div> \
        <div class="chat"> \
          <div class="chatting inactive"></div> \
          <input class="inactive" type="text" name="chat-input" value="type to chat..."/> \
          <div class="iscomposing"></div> \
        </div> \
      </div> \
    </div> \
    ');

    $("#sessions").append(session_div);

    var session = $("#sessions .session").filter(":last");
    var call_status = $(session).find(".call");
    var close = $(session).find("> .close");
    var chat_input = $(session).find(".chat > input[type='text']");

    $(session).hover(function() {
      if ($(call_status).hasClass("inactive"))
        $(close).show();
    },
    function() {
      $(close).hide();
    });

    close.click(function() {
      GUI.removeSession(session, null, true);
    });

     chat_input.focus(function(e) {
      if ($(this).hasClass("inactive")) {
      $(this).val("");
      $(this).removeClass("inactive");
      }
    });

    chat_input.blur(function(e) {
      if ($(this).val() == "") {
        $(this).addClass("inactive");
        $(this).val("type to chat...");
      }
    });

    chat_input.keydown(function(e) {
      // Ignore TAB and ESC.
      if (e.which == 9 || e.which == 27) {
        return false;
      }
      // Enter pressed? so send chat.
      else if (e.which == 13 && $(this).val() != "") {
        var text = chat_input.val();
        GUI.addChatMessage(session, "me", text);
        chat_input.val("");
        GUI.jssipMessage(uri, text);
      }
      // Ignore Enter when empty input.
      else if (e.which == 13 && $(this).val() == "") {
        return false;
      }
      // NOTE is-composing stuff.
      // Ignore "windows" and ALT keys, DEL, mayusculas and 0 (que no sé qué es).
      else if (e.which == 18 || e.which == 91 || e.which == 46 || e.which == 16 || e.which == 0)
        return false;
      // If this is the first char in the input and the chatting session
      // is active, then send a iscomposing notification.
      else if (e.which != 8 && $(this).val() == "") {
        GUI.jssipIsComposing(uri, true);
      }
      // If this is a DELETE key and the input has been totally clean, then send "idle" isomposing.
      else if (e.which == 8 && $(this).val().match("^.$"))
        GUI.jssipIsComposing(uri, false);
    });

    $(session).fadeIn(100);

    // Return the jQuery object for the created session div.
    return session;
  },


  setCallSessionStatus : function(session, status, description) {
    var session = session;
    var uri = $(session).find(".peer > .uri").text();
    var call = $(session).find(".call");
    var status_text = $(session).find(".call-status");
    var button_dial = $(session).find(".button.dial");
    var button_hangup = $(session).find(".button.hangup");
    var button_hold = $(session).find(".button.hold");
    var button_resume = $(session).find(".button.resume");

    // If the call is not inactive or terminated, then hide the
    // close button (without waiting for blur() in the session div).
    if (status != "inactive" && status != "terminated") {
      $(session).unbind("hover");
      $(session).find("> .close").hide();
    }

    // Unset all the functions assigned to buttons.
    button_dial.unbind("click");
    button_hangup.unbind("click");
    button_hold.unbind("click");
    button_resume.unbind("click");

    button_hangup.click(function() {
      GUI.setCallSessionStatus(session, "terminated", "terminated");
      session.call.terminate();
      GUI.removeSession(session, 500);
    });

    switch(status) {
      case "inactive":
        call.removeClass();
        call.addClass("call inactive");
        status_text.text("");

        button_dial.click(function() {
          session.call = GUI.jssipCall(uri);
        });
        break;

      case "trying":
        call.removeClass();
        call.addClass("call trying");
        status_text.text(description || "trying...");
        soundPlayer.setAttribute("src", "sounds/outgoing-call2.ogg");
        soundPlayer.play();

        // unhide HTML Video Elements
        $('#remoteView').attr('hidden', false);
        $('#selfView').attr('hidden', false);

        // Set background image
        $('#remoteView').attr('poster', "images/sip-on-the-web.png");
        break;

      case "in-progress":
        call.removeClass();
        call.addClass("call in-progress");
        status_text.text(description || "in progress...");
        break;

      case "answered":
        call.removeClass();
        call.addClass("call answered");
        status_text.text(description || "answered");
        break;

      case "terminated":
        call.removeClass();
        call.addClass("call terminated");
        status_text.text(description || "terminated");
        break;

      case "incoming":
        call.removeClass();
        call.addClass("call incoming");
        status_text.text("incoming call...");
        soundPlayer.setAttribute("src", "sounds/incoming-call2.ogg");
        soundPlayer.play();

        button_dial.click(function() {
          document.title = PageTitle;
          var selfView = document.getElementById('selfView');
          var remoteView = document.getElementById('remoteView');
          session.call.answer(selfView, remoteView);
        });

        // unhide HTML Video Elements
        $('#remoteView').attr('hidden', false);
        $('#selfView').attr('hidden', false);

        // Set background image
        $('#remoteView').attr('poster', "images/sip-on-the-web.png");
        break;

      default:
        alert("ERROR: setCallSessionStatus() called with unknown status '" + status + "'");
        break;
    }
  },


  removeSession : function(session, time, force) {
    var default_time = 500;
    var uri = $(session).find(".peer > .uri").text();
    var chat_input = $(session).find(".chat > input[type='text']");

    if (force || ($(session).find(".chat .chatting").hasClass("inactive") && (chat_input.hasClass("inactive") || chat_input.val() == ""))) {
      time = ( time ? time : default_time );
      $(session).fadeTo(time, 0.7, function() {
        $(session).slideUp(100, function() {
          $(session).remove();
        });
      });
      // Enviar "iscomposing idle" si estábamos escribiendo.
      if (! chat_input.hasClass("inactive") && chat_input.val() != "")
        GUI.jssipIsComposing(uri, false);
    }
    else {
      // Como existe una sesión de chat, no cerramos el div de sesión,
      // en su lugar esperamos un poco antes de ponerlo como "inactive".
      setTimeout('GUI.setDelayedCallSessionStatus("'+uri+'", "inactive")', 1000);
    }

    // hide HTML Video Elements
    $('#remoteView').attr('hidden', true);
    $('#selfView').attr('hidden', true);
  },


  setDelayedCallSessionStatus : function(uri, status, description, force) {
    var session = GUI.getSession(uri);
    if (session)
      GUI.setCallSessionStatus(session, status, description, force);
  },


  /*
   * Añade un mensaje en el chat de la sesión.
   * - session: el objeto jQuery de la sesión.
   * - who: "me" o "peer".
   * - text: el texto del mensaje.
   */
  addChatMessage : function(session, who, text) {
    var chatting = $(session).find(".chat > .chatting");
    $(chatting).removeClass("inactive");

    if (who != "error") {
      var who_text = ( who == "me" ? "me" : $(session).find(".peer > .display-name").text() );
      var message_div = $('<p class="' + who + '"><b>' + who_text + '</b>: ' + text + '</p>');
    }
    // ERROR sending the MESSAGE.
    else {
      var message_div = $('<p class="error"><i>message failed: ' + text + '</i>');
    }
    $(chatting).append(message_div);
    $(chatting).scrollTop(1e4);

    if (who == "peer") {
      soundPlayer.setAttribute("src", "sounds/incoming-chat.ogg");
      soundPlayer.play();
    }

    // Si se había recibido un iscomposing quitarlo (sólo si es message entrante!!!).
    if (who == "peer")
      $(session).find(".chat .iscomposing").hide();
  },


/*
   * Cambia el indicador de "Status". Debe llamarse con uno de estos valores:
   * - "connected"
   * - "registered"
   * - "disconnected"
   */
  setStatus : function(status) {
    $("#conn-status").removeClass();
    $("#conn-status").addClass(status);
    $("#conn-status > .value").text(status);

    register_checkbox.attr("disabled", false);
    if(status == "registered")
      register_checkbox.attr("checked", true);
    else
      register_checkbox.attr("checked", false);
  },


  jssipCall : function(target) {
      var views, selfView, remoteView, useAudio, useVideo;

      selfView = document.getElementById('selfView');
      remoteView = document.getElementById('remoteView');
      views = {selfView: selfView, remoteView: remoteView};
      useAudio = true;
      useVideo = $('#video').is(':checked');

      try {
        MyPhone.call(target, useAudio, useVideo, null, views);
      } catch(e){
        console.log(e);
        return;
      }
  },


  jssipMessage : function(uri, text) {
    try {
      MyPhone.sendMessage(uri,text);
    } catch(e){
      console.log(e);
      return;
    }
  },


  jssipIsComposing : function(uri, active) {
    //JsSIP.API.is_composing(uri, active);
    console.info('is compossing..')
  }

};
