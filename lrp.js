// LRP — Lighting Render & Post-Processing
// v0.20.0 — Prototype 0.1: controlled lighting proof

(function () {
    'use strict';

    const VERSION = '0.20.0';
    const PLUGIN_ID = 'lrp';

    let prototype_action;
    let prototype_light;
    let prototype_enabled = false;

    function enablePrototype() {
        if (prototype_enabled) return;
        if (typeof THREE === 'undefined' || !Canvas || !Canvas.scene) return;

        prototype_light = new THREE.DirectionalLight(0xffffff, 1.0);
        prototype_light.name = 'LRP_Prototype_01_Light';
        prototype_light.position.set(4, 6, 4);
        Canvas.scene.add(prototype_light);
        prototype_enabled = true;

        if (typeof Canvas.updateView === 'function') {
            Canvas.updateView({element_aspects: {lighting: true}});
        }
    }

    function disablePrototype() {
        if (!prototype_enabled) return;

        if (prototype_light && prototype_light.parent) {
            prototype_light.parent.remove(prototype_light);
        }
        prototype_light = null;
        prototype_enabled = false;

        if (typeof Canvas.updateView === 'function') {
            Canvas.updateView({element_aspects: {lighting: true}});
        }
    }

    Plugin.register(PLUGIN_ID, {
        title: 'LRP — Lighting Render & Post-Processing',
        author: 'Yama Sung',
        description: 'LRP — a lightweight foundation for controlled lighting experiments in Blockbench.',
        icon: 'lightbulb',
        version: VERSION,
        variant: 'both',
        min_version: '4.12.0',

        onload() {
            prototype_action = new Action('lrp_prototype_01', {
                name: 'LRP Prototype 0.1 — Test Light',
                description: 'Toggle the isolated Prototype 0.1 directional light.',
                icon: 'lightbulb',
                click() {
                    if (prototype_enabled) {
                        disablePrototype();
                    } else {
                        enablePrototype();
                    }
                }
            });

            MenuBar.menus.tools.addAction(prototype_action);
        },

        onunload() {
            disablePrototype();
            if (prototype_action) {
                prototype_action.delete();
                prototype_action = null;
            }
        }
    });
})();
