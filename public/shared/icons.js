// Ikon SVG bersama (pengganti emoji/simbol). Gaya sama dengan ikon lain: viewBox 24, garis currentColor, ujung bulat.
// Pakai: Icon('star') -> string <svg class="ic ic-star">; Icon('star','on') menambah kelas (on = terisi). Icon.d(nama) = array atribut path (untuk Path2D di kanvas).
(()=>{
const D={
 star:['M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z'],
 bell:['M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9z','M10 20a2 2 0 0 0 4 0'],
 lock:['M5 11h14v9H5z','M8 11V8a4 4 0 0 1 8 0v3'],
 eye:['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z','M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
 eyeoff:['M2 12s3.6-7 10-7c2 0 3.7.6 5.2 1.5M22 12s-3.6 7-10 7c-2 0-3.7-.6-5.2-1.5','M10 10a2.5 2.5 0 0 0 3.5 3.5','M4 4l16 16'],
 copy:['M9 9h11v11H9z','M5 15V5h10'],
 trash:['M4 7h16','M9 7V4h6v3','M6 7l1 13h10l1-13','M10 11v5M14 11v5'],
 gear:['M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z','M19.4 15a1.65 1.65 0 0 0 .330 1.82l.060.06a2 2 0 1 1-2.83 2.83l-.060-.060a1.65 1.65 0 0 0-1.82-.330 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.090A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.330l-.060.06a2 2 0 1 1-2.83-2.83l.060-.060A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.090A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.330-1.82l-.060-.060a2 2 0 1 1 2.83-2.83l.060.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.090a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.330l.060-.060a2 2 0 1 1 2.83 2.83l-.060.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.090a1.65 1.65 0 0 0-1.51 1z'],
 undo:['M9 14L4 9l5-5','M4 9h10a6 6 0 0 1 0 12h-3'],
 redo:['M15 14l5-5-5-5','M20 9H10a6 6 0 0 0 0 12h3'],
 check:['M5 12.5l4.5 4.5L19 7'],
 x:['M6 6l12 12M18 6L6 18'],
 dash:['M6 12h12'],
 dots:['M6 12h.01M12 12h.01M18 12h.01'],
 warn:['M12 4l9 16H3z','M12 10v4M12 17h.01'],
 arrowR:['M5 12h14M13 6l6 6-6 6'],
 arrowL:['M19 12H5M11 6l-6 6 6 6'],
 ext:['M7 17L17 7','M9 7h8v8'],
 chevR:['M9 6l6 6-6 6'],
 chevD:['M6 9l6 6 6-6'],
 triup:['M12 6.5l7 11H5z'],
 tridn:['M12 17.5l-7-11h14z']
};
const FILL={triup:1,tridn:1};
const Icon=(n,c)=>{const d=D[n];if(!d)return'';return'<svg class="ic ic-'+n+(FILL[n]?' ic-f':'')+(c?' '+c:'')+'" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+d.map(p=>'<path d="'+p+'"/>').join('')+'</svg>'};
Icon.d=n=>(D[n]||[]).slice();
window.Icon=Icon;
})();
