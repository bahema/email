// Remove the retired visitor appearance preference; the admin palette is authoritative.
(function () {
 try { localStorage.removeItem('affiliate_client_theme'); } catch (_) {}
 delete document.documentElement.dataset.clientTheme;
 document.documentElement.style.colorScheme = '';
})();
