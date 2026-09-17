// LRP — Lighting Render & Post-Processing
// v0.18.0 — Project rename and outline-system removal
// Mobile optimization foundation for Blockbench.

(function () {
    'use strict';

    const VERSION = '0.18.0';
    const PLUGIN_ID = 'lrp';
    const MOBILE_OPTIMIZER_ACTION_ID = 'lrp_mobile_optimizer_action';

    let mobileOptimizationEnabled = false;
    let originalPreviewRender = null;
    let cameraListenerInstalled = false;

    const originalPixelRatios = new Map();

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function safeDelete(item) {
        try { item?.delete?.(); } catch (error) {}
    }

    function calculatePixelRatio(preview) {
        const camera = preview?.camera;
        if (!camera) return 1;

        if (camera.isOrthographicCamera) {
            const zoom = Math.max(0.01, Number(camera.zoom) || 0.5);
            return clamp(
                0.3 + clamp(Math.sqrt(zoom / 0.5), 0, 1) * 0.7,
                0.3,
                1
            );
        }

        const target = preview.controls?.target;
        let distance = 40;
        if (camera.position && target && camera.position.distanceTo) {
            distance = camera.position.distanceTo(target);
        }

        const normalized = clamp(
            (Math.log(320) - Math.log(Math.max(20, distance))) /
            (Math.log(320) - Math.log(20)),
            0,
            1
        );

        return clamp(0.3 + normalized * 0.7, 0.3, 1);
    }

    function applyOptimizationToPreview(preview) {
        if (!mobileOptimizationEnabled || !preview?.renderer?.setPixelRatio) return;

        const renderer = preview.renderer;
        if (!originalPixelRatios.has(renderer)) {
            originalPixelRatios.set(
                renderer,
                renderer.getPixelRatio?.() || window.devicePixelRatio || 1
            );
        }

        const ratio = calculatePixelRatio(preview);
        if (!renderer.getPixelRatio || Math.abs(renderer.getPixelRatio() - ratio) > 0.01) {
            renderer.setPixelRatio(ratio);
        }
    }

    function applyOptimizationToAllPreviews() {
        try {
            const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
                ? Preview.all
                : [];
            for (const preview of previews) {
                applyOptimizationToPreview(preview);
            }
        } catch (error) {}
    }

    function installRenderHook() {
        if (
            originalPreviewRender ||
            typeof Preview === 'undefined' ||
            !Preview.prototype?.render
        ) return;

        originalPreviewRender = Preview.prototype.render;
        Preview.prototype.render = function () {
            if (mobileOptimizationEnabled) {
                applyOptimizationToPreview(this);
            }
            return originalPreviewRender.apply(this, arguments);
        };
    }

    function removeRenderHook() {
        try {
            if (
                originalPreviewRender &&
                typeof Preview !== 'undefined' &&
                Preview.prototype?.render
            ) {
                Preview.prototype.render = originalPreviewRender;
            }
        } catch (error) {}

        originalPreviewRender = null;
    }

    function onCameraPositionUpdate(event) {
        if (!mobileOptimizationEnabled) return;

        if (event?.preview) {
            applyOptimizationToPreview(event.preview);
        } else {
            applyOptimizationToAllPreviews();
        }
    }

    function installCameraListener() {
        if (cameraListenerInstalled || typeof Blockbench?.on !== 'function') return;

        Blockbench.on('update_camera_position', onCameraPositionUpdate);
        cameraListenerInstalled = true;
    }

    function removeCameraListener() {
        try {
            if (
                cameraListenerInstalled &&
                Blockbench.removeListener
            ) {
                Blockbench.removeListener(
                    'update_camera_position',
                    onCameraPositionUpdate
                );
            }
        } catch (error) {}

        cameraListenerInstalled = false;
    }

    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;

        if (mobileOptimizationEnabled) {
            installRenderHook();
            installCameraListener();
            applyOptimizationToAllPreviews();
        } else {
            removeRenderHook();

            for (const [renderer, ratio] of originalPixelRatios) {
                renderer?.setPixelRatio?.(ratio);
            }

            originalPixelRatios.clear();
        }

        Blockbench.showQuickMessage(
            'LRP Mobile Optimization: ' +
            (mobileOptimizationEnabled ? 'ON' : 'OFF')
        );
    }

    let mobileAction;

    Plugin.register(PLUGIN_ID, {
        title: 'LRP — Lighting Render & Post-Processing',
        author: 'Yama Sung',
        description: 'LRP (Lighting Render & Post-Processing) — mobile optimization foundation for Blockbench.',
        icon: 'lightbulb',
        version: VERSION,
        variant: 'both',
        min_version: '4.12.0',

        onload() {
            mobileAction = new Action(MOBILE_OPTIMIZER_ACTION_ID, {
                name: 'LRP Mobile Optimization: Toggle',
                icon: 'speed',
                click: () => setMobileOptimization(!mobileOptimizationEnabled)
            });

            MenuBar.menus.tools.addAction(mobileAction);
        },

        onunload() {
            setMobileOptimization(false);
            removeRenderHook();
            removeCameraListener();
            safeDelete(mobileAction);
            mobileAction = null;
        }
    });
})();
