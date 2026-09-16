// ICS — Immortal Cursed Spirit
// Mobile optimization + 2D-inspired renderer-side outlines.
// The outline is a silhouette shell: internal vertices/edges are not drawn.

(function () {
    'use strict';

    const VERSION = '0.8.0';
    const PLUGIN_ID = 'ics';
    const TOOLBAR_ID = 'main_tools';
    const MENU_ID = 'ics_feature_menu';
    const MOBILE_OPTIMIZER_ID = 'ics_mobile_optimizer';
    const MOBILE_OPTIMIZER_ACTION_ID = 'ics_mobile_optimizer_action';
    const OUTLINE_ACTION_ID = 'ics_outlines_action';
    const OUTLINE_OBJECT_KEY = '__ics_outline';

    // Outline philosophy:
    // Think about the result as a 2D drawing first. A circle has many vertices,
    // but its drawing only needs the visible outside contour. The 3D version
    // therefore renders an expanded back-facing shell behind the real mesh.
    const OUTLINE_THICKNESS = 0.12;

    const tools = [];
    const actions = [];
    const originalPixelRatios = new Map();
    let mobileOptimizationEnabled = false;
    let originalPreviewRender = null;
    let cameraListenerInstalled = false;
    let outlinesEnabled = false;

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

    // ---------------------------------------------------------------------
    // MOBILE OPTIMIZATION
    // ---------------------------------------------------------------------

    function calculatePixelRatio(preview) {
        const camera = preview?.camera;
        if (!camera) return 1;

        if (camera.isOrthographicCamera) {
            const zoom = Math.max(0.01, Number(camera.zoom) || 0.5);
            const normalized = clamp(Math.sqrt(zoom / 0.5), 0, 1);
            return clamp(0.3 + normalized * 0.7, 0.3, 1);
        }

        const target = preview?.controls?.target;
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
        if (currentRatio === null || Math.abs(currentRatio - desiredRatio) > 0.01) {
            renderer.setPixelRatio(desiredRatio);
        }
    }

    function applyOptimizationToAllPreviews() {
        try {
            const previews = typeof Preview !== 'undefined' && Array.isArray(Preview.all)
                ? Preview.all
                : [];
            for (const preview of previews) applyOptimizationToPreview(preview);
        } catch (error) {
            console.warn('[ICS] Mobile optimization update failed:', error);
        }
    }

    function installRenderHook() {
        if (typeof Preview === 'undefined' || !Preview.prototype || typeof Preview.prototype.render !== 'function') return;
        if (originalPreviewRender) return;

        originalPreviewRender = Preview.prototype.render;
        Preview.prototype.render = function () {
            if (mobileOptimizationEnabled) applyOptimizationToPreview(this);
            return originalPreviewRender.apply(this, arguments);
        };
    }

    function removeRenderHook() {
        try {
            if (originalPreviewRender && typeof Preview !== 'undefined' && Preview.prototype?.render) {
                Preview.prototype.render = originalPreviewRender;
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
            try { preview.render?.(); } catch (error) {}
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
                    if (renderer && typeof renderer.setPixelRatio === 'function') renderer.setPixelRatio(ratio);
                }
            } catch (error) {
                console.warn('[ICS] Failed to restore renderer ratios:', error);
            }
            originalPixelRatios.clear();
        }

        Blockbench.showQuickMessage(
            'ICS Mobile Optimization: ' + (mobileOptimizationEnabled ? 'ON' : 'OFF')
        );
    }

    function toggleMobileOptimization() {
        setMobileOptimization(!mobileOptimizationEnabled);
    }

    // ---------------------------------------------------------------------
    // 2D-INSPIRED SILHOUETTE OUTLINES
    // ---------------------------------------------------------------------
    //
    // The previous implementation used EdgesGeometry. That answers the
    // question "where are the mesh edges?", but that is not the visual
    // definition of an outline. A 2D outline answers "where is the outside
    // contour of the visible shape?"
    //
    // We therefore use a classic inverted-shell approach entirely in the
    // renderer. The shell is expanded along vertex normals and rendered with
    // BackSide. The real mesh is drawn over it, hiding all internal shell
    // edges. No project geometry, texture, material, or PBR data is changed.
    // ---------------------------------------------------------------------

    function getOutlineMaterial() {
        if (typeof THREE === 'undefined') return null;
        if (getOutlineMaterial.material) return getOutlineMaterial.material;

        try {
            getOutlineMaterial.material = new THREE.ShaderMaterial({
                uniforms: {
                    icsOutlineThickness: { value: OUTLINE_THICKNESS }
                },
                vertexShader: `
                    uniform float icsOutlineThickness;
                    void main() {
                        vec3 expanded = position + normalize(normal) * icsOutlineThickness;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(expanded, 1.0);
                    }
                `,
                fragmentShader: `
                    void main() {
                        gl_FragColor = vec4(0.067, 0.067, 0.067, 0.95);
                    }
                `,
                side: THREE.BackSide,
                transparent: true,
                depthTest: true,
                depthWrite: false,
                toneMapped: false
            });
            getOutlineMaterial.material.name = 'ICS Silhouette Outline Material';
            return getOutlineMaterial.material;
        } catch (error) {
            console.warn('[ICS] Could not create outline material:', error);
            return null;
        }
    }

    function disposeOutlineObject(outline) {
        try {
            if (!outline) return;
            if (outline.parent) outline.parent.remove(outline);
            // The geometry belongs to Blockbench's mesh and is intentionally
            // shared. Never dispose it here.
        } catch (error) {
            console.warn('[ICS] Outline cleanup failed:', error);
        }
    }

    function createOutlineForMesh(mesh) {
        if (!mesh || !mesh.isMesh || !mesh.geometry) return null;
        if (mesh.userData?.[OUTLINE_OBJECT_KEY]) return mesh.userData[OUTLINE_OBJECT_KEY];

        const material = getOutlineMaterial();
        if (!material || typeof THREE === 'undefined') return null;

        try {
            const outline = new THREE.Mesh(mesh.geometry, material);
            outline.name = 'ics_outline';
            outline.userData = outline.userData || {};
            outline.userData.icsOutline = true;
            outline.renderOrder = 999;
            outline.frustumCulled = mesh.frustumCulled;
            outline.matrixAutoUpdate = true;

            // Keep the shell in the exact same local coordinate system as the
            // original mesh. This preserves arbitrary rotations/scales.
            mesh.add(outline);
            mesh.userData = mesh.userData || {};
            mesh.userData[OUTLINE_OBJECT_KEY] = outline;
            return outline;
        } catch (error) {
            console.warn('[ICS] Could not create outline:', error);
            return null;
        }
    }

    function removeOutlineFromMesh(mesh) {
        if (!mesh?.userData) return;
        const outline = mesh.userData[OUTLINE_OBJECT_KEY];
        if (!outline) return;
        disposeOutlineObject(outline);
        delete mesh.userData[OUTLINE_OBJECT_KEY];
    }

    function applyOutlineToObject(object) {
        if (!outlinesEnabled || !object?.traverse) return;
        object.traverse(child => {
            if (!child || child.userData?.icsOutline) return;
            if (child.isMesh && child.geometry) createOutlineForMesh(child);
        });
    }

    function applyOutlinesToAllElements() {
        if (!outlinesEnabled) return;
        try {
            const elements = typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)
                ? Outliner.elements
                : [];
            for (const element of elements) {
                const object = element?.mesh;
                if (object) applyOutlineToObject(object);
            }
        } catch (error) {
            console.warn('[ICS] Outline update failed:', error);
        }
    }

    function removeAllOutlines() {
        try {
            const elements = typeof Outliner !== 'undefined' && Array.isArray(Outliner.elements)
                ? Outliner.elements
                : [];
            for (const element of elements) {
                const object = element?.mesh;
                if (!object?.traverse) continue;
                object.traverse(child => removeOutlineFromMesh(child));
            }
        } catch (error) {
            console.warn('[ICS] Outline removal failed:', error);
        }
    }

    function setOutlinesEnabled(enabled) {
        outlinesEnabled = !!enabled;
        if (outlinesEnabled) {
            applyOutlinesToAllElements();
            Blockbench.showQuickMessage('ICS Outlines: ON');
        } else {
            removeAllOutlines();
            Blockbench.showQuickMessage('ICS Outlines: OFF');
        }
    }

    function toggleOutlines() {
        setOutlinesEnabled(!outlinesEnabled);
    }

    function refreshOutlinesAfterSceneUpdate() {
        if (outlinesEnabled) applyOutlinesToAllElements();
    }

    function installOutlineRefreshListener() {
        if (typeof Blockbench?.on !== 'function') return;
        Blockbench.on('update_camera_position', refreshOutlinesAfterSceneUpdate);
    }

    function removeOutlineRefreshListener() {
        try {
            if (typeof Blockbench?.removeListener === 'function') {
                Blockbench.removeListener('update_camera_position', refreshOutlinesAfterSceneUpdate);
            }
        } catch (error) {
            console.warn('[ICS] Outline listener cleanup failed:', error);
        }
    }

    function cleanupOutlines() {
        outlinesEnabled = false;
        removeOutlineRefreshListener();
        removeAllOutlines();
        if (getOutlineMaterial.material?.dispose) getOutlineMaterial.material.dispose();
        getOutlineMaterial.material = null;
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
        cleanupOutlines();
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
        description: 'Renderer-side visual tools for Blockbench.',
        about: '',
        version: VERSION,
        icon: 'memory',
        variant: 'both',
        min_version: '4.0.0',

        onload() {
            createFeature(MOBILE_OPTIMIZER_ID, 'Mobile Optimization', 'speed', toggleMobileOptimization);
            createFeatureAction(MOBILE_OPTIMIZER_ACTION_ID, 'Mobile Optimization', 'speed', toggleMobileOptimization);
            createFeatureAction(OUTLINE_ACTION_ID, 'Outlines', 'border_all', toggleOutlines);
            installOutlineRefreshListener();
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
