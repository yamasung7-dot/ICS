// LRP — Lighting Render & Post-Processing
// v1.0.0 — Lighting controller foundation

(function () {
    'use strict';

    const VERSION = '1.0.0';
    const PLUGIN_ID = 'lrp';

    let controller_action;
    let controller_root;
    let controller_light;
    let controller_target;
    let controller_helper;
    let controller_enabled = false;
    let transformer_listener;

    function refreshController() {
        if (controller_helper && typeof controller_helper.update === 'function') {
            controller_helper.update();
        }
        if (typeof Canvas.updateView === 'function') {
            Canvas.updateView({element_aspects: {lighting: true}});
        }
    }

    function enableController() {
        if (controller_enabled) return;
        if (typeof THREE === 'undefined' || !Canvas || !Canvas.scene) return;
        if (typeof Transformer === 'undefined' || !Transformer) return;

        controller_root = new THREE.Object3D();
        controller_root.name = 'LRP_Light_Controller';
        controller_root.position.set(0, 0, 0);

        controller_light = new THREE.DirectionalLight(0xffffff, 1.0);
        controller_light.name = 'LRP_Directional_Light';
        controller_light.position.set(4, 6, 4);

        controller_target = new THREE.Object3D();
        controller_target.name = 'LRP_Directional_Target';
        controller_target.position.set(0, 0, 0);

        controller_light.target = controller_target;
        controller_root.add(controller_light);
        controller_root.add(controller_target);

        controller_helper = new THREE.DirectionalLightHelper(controller_light, 1.0);
        controller_helper.name = 'LRP_Light_Controller_Helper';
        controller_root.add(controller_helper);

        Canvas.scene.add(controller_root);

        transformer_listener = function () {
            refreshController();
        };
        Transformer.addEventListener('change', transformer_listener);
        Transformer.attach(controller_root);

        controller_enabled = true;
        refreshController();
    }

    function disableController() {
        if (!controller_enabled) return;

        if (typeof Transformer !== 'undefined' && Transformer) {
            Transformer.detach();
            if (transformer_listener) {
                Transformer.removeEventListener('change', transformer_listener);
            }
        }
        transformer_listener = null;

        if (controller_root && controller_root.parent) {
            controller_root.parent.remove(controller_root);
        }

        if (controller_helper && typeof controller_helper.dispose === 'function') {
            controller_helper.dispose();
        }

        controller_helper = null;
        controller_target = null;
        controller_light = null;
        controller_root = null;
        controller_enabled = false;

        if (typeof Canvas.updateView === 'function') {
            Canvas.updateView({element_aspects: {lighting: true}});
        }
    }

    Plugin.register(PLUGIN_ID, {
        title: 'LRP — Lighting Render & Post-Processing',
        author: 'Yama Sung',
        description: 'LRP — a lightweight foundation for controlled lighting and rendering experiments in Blockbench.',
        icon: 'lightbulb',
        version: VERSION,
        variant: 'both',
        min_version: '4.12.0',

        onload() {
            controller_action = new Action('lrp_light_controller', {
                name: 'LRP — Light Controller',
                description: 'Toggle the LRP directional light and its transform controller.',
                icon: 'lightbulb',
                click() {
                    if (controller_enabled) {
                        disableController();
                    } else {
                        enableController();
                    }
                }
            });

            MenuBar.menus.tools.addAction(controller_action);
        },

        onunload() {
            disableController();
            if (controller_action) {
                controller_action.delete();
                controller_action = null;
            }
        }
    });
})();
