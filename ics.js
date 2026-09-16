// ICS — Immortal Cursed Spirit
// Mobile optimization feature + clean feature template for Blockbench.
// Toolbox tool + collapsible Tools-menu hierarchy.

(function () {
    'use strict';

    const VERSION = '0.6.0';
    const PLUGIN_ID = 'ics';
    const TOOLBAR_ID = 'main_tools';
    const MENU_ID = 'ics_feature_menu';
    const MOBILE_OPTIMIZER_ID = 'ics_mobile_optimizer';
    const MOBILE_OPTIMIZER_ACTION_ID = 'ics_mobile_optimizer_action';

    const tools = [];
    const actions = [];
    const originalPixelRatios = new Map();
    let mobileOptimizationEnabled = false;
    let originalPreviewRender = null;
    let cameraListenerInstalled = false;

    function safeDelete(item) {
        try {
            if (item && typeof item.delete === 'function') item.delete();
        } catch (error) {
            console.warn('[ICS] Cleanup failed:', error);
        }
    }

    function removeMenuHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;
            menu.structure = (menu.structure || []).filter(item => {
                if (!item) return true;
                return item.id !== MENU_ID && !String(item.id || '').startsWith('ics_');
            });
            menu.update?.(true);
        } catch (error) {
            console.warn('[ICS] Menu cleanup failed:', error);
        }
    }

    function returnToMoveTool() {
        try {
            if (typeof BarItems !== 'undefined' && BarItems.move_tool?.select) {
                BarItems.move_tool.select();
            }
        } catch (error) {}
    }

    function createFeature(id, name, icon, handler) {
        const tool = new Tool(id, {
            name,
            icon,
            category: 'tools',
            toolbar: TOOLBAR_ID,
            transformerMode: 'hidden',
            modes: ['edit', 'paint', 'display', 'animate', 'pose'],
            onSelect() {
                try {
                    handler?.();
                } catch (error) {
                    console.error('[ICS] Feature failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
                returnToMoveTool();
            }
        });

        tools.push(tool);
        return tool;
    }

    function createFeatureAction(id, name, icon, handler) {
        const action = new Action(id, {
            name,
            icon,
            click() {
                try {
                    handler?.();
                } catch (error) {
                    console.error('[ICS] Feature action failed:', id, error);
                    Blockbench.showQuickMessage('ICS feature failed');
                }
            }
        });

        actions.push(action);
        return action;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Convert camera distance/zoom into a mobile render pixel ratio.
    // Close views stay sharp; progressively distant views use fewer pixels.
    function calculatePixelRatio(preview) {
        const camera = preview?.camera;
        if (!camera) return 1;

        if (camera.isOrthographicCamera) {
            const zoom = Math.max(0.01, Number(camera.zoom) || 0.5);
            const normalized = clamp(Math.sqrt(zoom / 0.5), 0, 1);
            return clamp(0.3 + normalized * 0.7, 0.3, 1);
        }

        const controls = preview?.controls;
        const target = controls?.target;
        let distance = 40;

        if (camera.position && target && typeof camera.position.distanceTo === 'function') {
            distance = camera.position.distanceTo(target);
        } else if (camera.position && typeof camera.position.length === 'function') {
            distance = camera.position.length();
        }

        const nearDistance = 20;
        const farDistance = 320;
        const normalized = clamp(
            (Math.log(farDistance) - Math.log(Math.max(nearDistance, distance))) /
            (Math.log(farDistance) - Math.log(nearDistance)),
            0,
            1
        );

        return clamp(0.3 + normalized * 0.7, 0.3, 1);
    }

    function applyOptimizationToPreview(preview) {
        if (!mobileOptimizationEnabled || !preview) return;

        const renderer = preview.renderer;
        if (!renderer || typeof renderer.setPixelRatio !== 'function') return;

        if (!originalPixelRatios.has(renderer)) {
            const ratio = typeof renderer.getPixelRatio === 'function'
                ? renderer.getPixelRatio()
                : (window.devicePixelRatio || 1);
            originalPixelRatios.set(renderer, ratio);
        }

        const desiredRatio = calculatePixelRatio(preview);
        const currentRatio = typeof renderer.getPixelRatio === 'function'
            ? renderer.getPixelRatio()
            : null;

        // Avoid calling setPixelRatio every frame when the value has not changed.
        if (currentRatio === null || Math.abs(currentRatio - desiredRatio) > 0.01) {
            renderer.setPixelRatio(desiredRatio);
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
        } catch (error) {
            console.warn('[ICS] Mobile optimization update failed:', error);
        }
    }

    function installRenderHook() {
        if (typeof Preview === 'undefined' || !Preview.prototype || typeof Preview.prototype.render !== 'function') {
            return;
        }

        if (originalPreviewRender) return;

        originalPreviewRender = Preview.prototype.render;
        const icsRender = function () {
            if (mobileOptimizationEnabled) {
                applyOptimizationToPreview(this);
            }
            return originalPreviewRender.apply(this, arguments);
        };

        Preview.prototype.render = icsRender;
    }

    function removeRenderHook() {
        try {
            if (
                originalPreviewRender &&
                typeof Preview !== 'undefined' &&
                Preview.prototype &&
                Preview.prototype.render
            ) {
                // Only restore if ICS still owns the wrapper.
                const current = Preview.prototype.render;
                if (current !== originalPreviewRender) {
                    Preview.prototype.render = originalPreviewRender;
                }
            }
        } catch (error) {
            console.warn('[ICS] Render hook cleanup failed:', error);
        }
        originalPreviewRender = null;
    }

    function onCameraPositionUpdate(event) {
        if (!mobileOptimizationEnabled) return;
        const preview = event?.preview;
        if (preview) {
            applyOptimizationToPreview(preview);
            try {
                preview.render?.();
            } catch (error) {}
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
            if (cameraListenerInstalled && typeof Blockbench?.removeListener === 'function') {
                Blockbench.removeListener('update_camera_position', onCameraPositionUpdate);
            }
        } catch (error) {
            console.warn('[ICS] Camera listener cleanup failed:', error);
        }
        cameraListenerInstalled = false;
    }

    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;

        if (mobileOptimizationEnabled) {
            installRenderHook();
            installCameraListener();
            applyOptimizationToAllPreviews();
        } else {
            removeCameraListener();
            removeRenderHook();

            try {
                for (const [renderer, ratio] of originalPixelRatios) {
                    if (renderer && typeof renderer.setPixelRatio === 'function') {
                        renderer.setPixelRatio(ratio);
                    }
                }
            } catch (error) {
                console.warn('[ICS] Failed to restore renderer ratios:', error);
            }

            originalPixelRatios.clear();
        }

        const state = mobileOptimizationEnabled ? 'ON' : 'OFF';
        Blockbench.showQuickMessage('ICS Mobile Optimization: ' + state);
    }

    function toggleMobileOptimization() {
        setMobileOptimization(!mobileOptimizationEnabled);
    }

    function buildHierarchy() {
        try {
            const menu = MenuBar?.menus?.tools;
            if (!menu) return;

            removeMenuHierarchy();

            menu.structure.push({
                id: MENU_ID,
                name: 'ICS',
                icon: 'memory',
                children: actions.slice()
            });
            menu.update?.(true);
        } catch (error) {
            console.warn('[ICS] Hierarchy build failed:', error);
        }
    }

    function cleanup() {
        setMobileOptimization(false);
        removeCameraListener();
        removeRenderHook();
        originalPixelRatios.clear();
        removeMenuHierarchy();

        while (actions.length) safeDelete(actions.pop());
        while (tools.length) safeDelete(tools.pop());

        returnToMoveTool();
    }

    Plugin.register(PLUGIN_ID, {
        title: 'ICS — Immortal Cursed Spirit',
        author: 'TFO',
        description: '',
        about: '',
        version: VERSION,
        icon: 'memory',
        variant: 'both',
        min_version: '4.0.0',

        onload() {
            // ------------------------------------------------------------
            // FEATURE 01 — MOBILE OPTIMIZATION
            // ------------------------------------------------------------
            // Runs continuously with Blockbench's preview render pipeline.
            // Close views remain at full resolution; zooming farther out
            // progressively lowers render pixel density for mobile GPUs.
            // It does not change geometry, textures, materials, or PBR data.
            // ------------------------------------------------------------

            createFeature(
                MOBILE_OPTIMIZER_ID,
                'Mobile Optimization',
                'speed',
                toggleMobileOptimization
            );

            createFeatureAction(
                MOBILE_OPTIMIZER_ACTION_ID,
                'Mobile Optimization',
                'speed',
                toggleMobileOptimization
            );

            buildHierarchy();

            Blockbench.showQuickMessage('ICS v' + VERSION + ' loaded');
        },

        oninstall() {},

        onuninstall() {
            this.onunload();
        },

        onunload() {
            cleanup();
        }
    });
})();
