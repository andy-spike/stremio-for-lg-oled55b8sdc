// Calls to webOS system services (luna://...) through PalmServiceBridge, the
// object webOS injects into app pages.

var Luna = (function () {
  var pending = [];   // keep bridges referenced until they answer

  function call(uri, params) {
    return new Promise(function (resolve) {
      if (typeof PalmServiceBridge === "undefined") { resolve({ returnValue: false, errorText: "not on webOS" }); return; }
      var b = new PalmServiceBridge();
      pending.push(b);
      b.onservicecallback = function (msg) {
        pending.splice(pending.indexOf(b), 1);
        var r;
        try { r = JSON.parse(msg); } catch (e) { r = { returnValue: false }; }
        resolve(r);
      };
      b.call(uri, JSON.stringify(params || {}));
    });
  }

  // Runs a fixed command as root through Homebrew Channel. Only used for the
  // root-owned stremio-service script; never with user-provided text.
  function rootExec(command) {
    return call("luna://org.webosbrew.hbchannel.service/exec", { command: command });
  }

  // LG's media pipeline: track selection and embedded subtitles for the
  // hardware player (the same calls Stremio's official webOS player uses).
  function media(method, params) { return call("luna://com.webos.media/" + method, params); }

  function config(names) {
    return call("luna://com.webos.service.config/getConfigs", { configNames: names })
      .then(function (r) { return (r && r.configs) || {}; });
  }

  return { call: call, rootExec: rootExec, media: media, config: config };
})();
