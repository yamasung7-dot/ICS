// LRP — Lighting Render & Post-Processing
// v0.19.0 — Minimal loader foundation

(function () {
    'use strict';

    const VERSION = '0.19.0';
    const PLUGIN_ID = 'lrp';

    Plugin.register(PLUGIN_ID, {
        title: 'LRP — Lighting Render & Post-Processing',
        author: 'Yama Sung',
        description: 'LRP — a lightweight foundation for controlled lighting experiments in Blockbench.',
        icon: 'lightbulb',
        version: VERSION,
        variant: 'both',
        min_version: '4.12.0',

        onload() {
            // Intentionally empty for the foundation test.
            // No render hooks, camera listeners, or mobile optimization are installed.
        },

        onunload() {
            // Nothing to clean up yet.
        }
    });
})();
