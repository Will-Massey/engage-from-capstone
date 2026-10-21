(function(){
  var PIXEL='142992644300135';
  if(window.fbq)return;
  var n=window.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!window._fbq)window._fbq=n;
  n.push=n;n.loaded=true;n.version='2.0';n.queue=[];
  window.fbq('init',PIXEL);
  window.fbq('track','PageView');
  function load(){
    if(document.querySelector('script[src*="fbevents.js"]'))return;
    var t=document.createElement('script');
    t.async=true;t.src='https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(t);
  }
  if(document.readyState==='complete')load();
  else window.addEventListener('load',load,{once:true});
})();