/* gate.js: pages outside app.html open only for a signed-in student.
   The page stays hidden until the server confirms the sign-in saved by
   app.html (localStorage tjx2:sess) is still live and on the class list.
   If the server cannot be reached, a sign-in under 12 hours old is trusted,
   so a slow network never locks out a real student. */
(function(){
  var SYNC_URL='https://script.google.com/macros/s/AKfycbwy3bPHzxQ-0Qj7c7aNdc2QtI36ir4UfxQDdgBQGhXbtoPzVUN5TKav11xsB8_Nhb5Z9A/exec';
  var st=document.createElement('style');
  st.textContent='html.gated body>*:not(#gateMsg){display:none!important}'+
    '#gateMsg{max-width:420px;margin:18vh auto 0;padding:24px;font:15px/1.6 system-ui,sans-serif;text-align:center;color:#3a3531}'+
    '#gateMsg a{color:#7f0019}';
  document.head.appendChild(st);
  document.documentElement.classList.add('gated');

  var v=null; try{ v=JSON.parse(localStorage.getItem('tjx2:sess')); }catch(e){}
  var fresh=v&&v.t&&(Date.now()-(v.at||0))<11*3600*1000;
  function open(){ document.documentElement.classList.remove('gated'); var m=document.getElementById('gateMsg'); if(m) m.remove(); }
  function shut(why){
    var show=function(){
      var d=document.createElement('div'); d.id='gateMsg';
      d.innerHTML='<p>'+why+'</p><p><a href="app.html">Sign in on the drill site</a>, then open this page again.</p>'+
        '<p style="color:#857b70">請先喺 drill site 用學校認可嘅 Google account sign in，再開返呢頁。</p>';
      document.body.appendChild(d);
    };
    if(document.body) show(); else document.addEventListener('DOMContentLoaded',show);
  }
  if(!fresh){ shut('This page is for students on the class list.'); return; }

  var done=false, fn='__gate'+Math.random().toString(36).slice(2);
  var timer=setTimeout(function(){ if(!done){ done=true; open(); } }, 12000);
  window[fn]=function(r){
    if(done) return; done=true; clearTimeout(timer);
    if(r&&r.error==='sign in'){ try{ localStorage.removeItem('tjx2:sess'); }catch(e){} shut('Your sign-in has ended or your account is not on the class list.'); }
    else open();
  };
  var s=document.createElement('script');
  s.src=SYNC_URL+'?prof=1&t='+encodeURIComponent(v.t)+'&callback='+fn;
  s.onerror=function(){ if(!done){ done=true; clearTimeout(timer); open(); } };
  document.head.appendChild(s);
})();
