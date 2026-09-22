const CACHE = "bloc2-v4";
// Seuls ces domaines sont mis en cache hors ligne. Tout le reste (API Supabase
// en particulier) doit passer par le reseau : une reponse d'API mise en cache
// renverrait des donnees perimees.
const CDN = ["https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"];
const CORE = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(CORE); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  if (e.request.method !== "GET") return;
  var sameOrigin = new URL(e.request.url).origin === self.location.origin;
  if (sameOrigin){
    // reseau d'abord (pour recuperer les mises a jour), cache en secours (hors ligne)
    e.respondWith(
      fetch(e.request).then(function(r){
        var copy = r.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        return r;
      }).catch(function(){
        return caches.match(e.request).then(function(r){ return r || caches.match("./index.html"); });
      })
    );
  } else if (CDN.indexOf(new URL(e.request.url).origin) >= 0) {
    // polices et bibliotheques : cache d'abord, reseau sinon
    e.respondWith(
      caches.match(e.request).then(function(r){
        if (r) return r;
        return fetch(e.request).then(function(res){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
          return res;
        }).catch(function(){ return new Response("", {status: 504}); });
      })
    );
  }
});
