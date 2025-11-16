import { initializeBabylonApp } from "app_package";

let assetsHostUrl;
if (DEV_BUILD) {
    assetsHostUrl = "";
} else {
    assetsHostUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
}

(function (d) {
    var config = {
        kitId: 'njr1oia',
        scriptTimeout: 3000,
        async: true
    },
        h = d.documentElement, t = setTimeout(function () { h.className = h.className.replace(/\bwf-loading\b/g, "") + " wf-inactive"; }, config.scriptTimeout), tk = d.createElement("script"), f = false, s = d.getElementsByTagName("script")[0], a; h.className += " wf-loading"; tk.src = 'https://use.typekit.net/' + config.kitId + '.js'; tk.async = true; tk.onload = tk.onreadystatechange = function () { a = this.readyState; if (f || a && a != "complete" && a != "loaded") return; f = true; clearTimeout(t); try { Typekit.load(config); } catch (e) { } }; s.parentNode.insertBefore(tk, s);
})(document);

console.log("[Page] bundle entry", { dev: DEV_BUILD, assetsHostUrl });
try {
    initializeBabylonApp({ assetsHostUrl: assetsHostUrl });
    console.log("[Page] initializeBabylonApp called");
} catch (e) {
    console.log("[Page] initializeBabylonApp error", e);
}