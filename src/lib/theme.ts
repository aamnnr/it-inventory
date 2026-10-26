// Pilihan tema: Terang / Gelap / Sistem. Disimpan di localStorage browser masing-masing.

export const THEME_STORAGE_KEY = "kfg-theme";
export type ThemePreference = "light" | "dark" | "system";

/**
 * Script yang dijalankan di <head> sebelum halaman digambar (mencegah kedipan tema).
 * - Membaca pilihan dari localStorage (default: "system")
 * - Memasang data-theme (light/dark) dan data-theme-pref di <html>
 * - Mengikuti perubahan tema perangkat selama pilihannya "system"
 * - Menyediakan window.__setTheme(pref) untuk tombol pilihan tema
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var d=document.documentElement,k=${JSON.stringify(THEME_STORAGE_KEY)},p;
try{p=localStorage.getItem(k)}catch(e){}
if(p!=="light"&&p!=="dark")p="system";
var m=window.matchMedia("(prefers-color-scheme: dark)");
function apply(){d.setAttribute("data-theme",p==="system"?(m.matches?"dark":"light"):p);d.setAttribute("data-theme-pref",p)}
apply();
m.addEventListener("change",function(){if(p==="system")apply()});
window.__setTheme=function(n){p=n;try{localStorage.setItem(k,n)}catch(e){}apply()};
}catch(e){}})()`;

declare global {
  interface Window {
    __setTheme?: (pref: ThemePreference) => void;
  }
}
