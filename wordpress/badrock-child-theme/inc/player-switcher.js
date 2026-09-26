/**
 * Badrock Player Switcher Helper
 */
(function() {
    window.badrockSwitchServer = function(btn) {
        if (!btn) return;
        var parentTabs = btn.closest('.badrock-server-tabs');
        if (parentTabs) {
            var allBtns = parentTabs.querySelectorAll('.badrock-server-btn');
            allBtns.forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        }
        var container = btn.closest('.badrock-player-wrapper');
        if (container) {
            var frame = container.querySelector('#badrock-active-frame');
            var targetUrl = btn.getAttribute('data-url');
            if (frame && targetUrl) {
                frame.src = targetUrl;
            }
        }
    };
})();
