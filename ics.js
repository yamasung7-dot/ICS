// ICS — Immortal Cursed Spirit
// v0.17.0 — Scene-wide camera silhouette alignment
// Mobile optimization + 2D-first camera silhouette rendering.

(function () {
    'use strict';

    const VERSION = '0.17.0';
    const PLUGIN_ID = 'ics';
    const OUTLINE_SETTINGS_KEY = 'ics_outline_settings';
    const MOBILE_OPTIMIZER_ACTION_ID = 'ics_mobile_optimizer_action';
    const OUTLINE_ACTION_ID = 'ics_outlines_action';
    const OUTLINE_SETTINGS_ACTION_ID = 'ics_outline_settings_action';

    const DEFAULT_OUTLINE_THICKNESS = 0.12;
    const DEFAULT_OUTLINE_COLOR = '#111111';
    const DEFAULT_OUTLINE_TYPE = 'ink';

    const OUTLINE_STYLES = {
        hazard_shell: { name: 'Hazard Shell', opacity: 0.95, dashed: true },
        ink: { name: 'Ink', opacity: 1, dashed: false },
        sketch: { name: 'Sketch', opacity: 0.96, dashed: false }
    };

    let mobileOptimizationEnabled = false;
    let originalPreviewRender = null;
    let cameraListenerInstalled = false;
    let outlinesEnabled = false;
    let outlineThickness = DEFAULT_OUTLINE_THICKNESS;
    let outlineColor = DEFAULT_OUTLINE_COLOR;
    let outlineType = DEFAULT_OUTLINE_TYPE;

    const originalPixelRatios = new Map();
    const outlineStates = new Map();

    function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
    function safeDelete(item) { try { item?.delete?.(); } catch (error) {} }

    function loadOutlineSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(OUTLINE_SETTINGS_KEY) || 'null');
            if (!saved) return;
            if (Number.isFinite(Number(saved.thickness))) outlineThickness = clamp(Number(saved.thickness), 0.01, 0.5);
            if (typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) outlineColor = saved.color;
            if (typeof saved.type === 'string' && OUTLINE_STYLES[saved.type]) outlineType = saved.type;
        } catch (error) {}
    }
    function saveOutlineSettings() {
        try { localStorage.setItem(OUTLINE_SETTINGS_KEY, JSON.stringify({type: outlineType, thickness: outlineThickness, color: outlineColor})); } catch (error) {}
    }

    function calculatePixelRatio(preview) {
        const camera = preview?.camera;
        if (!camera) return 1;
        if (camera.isOrthographicCamera) {
            const zoom = Math.max(0.01, Number(camera.zoom) || 0.5);
            return clamp(0.3 + clamp(Math.sqrt(zoom / 0.5), 0, 1) * 0.7, 0.3, 1);
        }
        const target = preview.controls?.target;
        let distance = 40;
        if (camera.position && target && camera.position.distanceTo) distance = camera.position.distanceTo(target);
        const normalized = clamp((Math.log(320) - Math.log(Math.max(20, distance))) / (Math.log(320) - Math.log(20)), 0, 1);
        return clamp(0.3 + normalized * 0.7, 0.3, 1);
    }
    function applyOptimizationToPreview(preview) {
        if (!mobileOptimizationEnabled || !preview?.renderer?.setPixelRatio) return;
        const renderer = preview.renderer;
        if (!originalPixelRatios.has(renderer)) originalPixelRatios.set(renderer, renderer.getPixelRatio?.() || window.devicePixelRatio || 1);
        const ratio = calculatePixelRatio(preview);
        if (!renderer.getPixelRatio || Math.abs(renderer.getPixelRatio() - ratio) > 0.01) renderer.setPixelRatio(ratio);
    }
    function applyOptimizationToAllPreviews() {
        try { for (const preview of (typeof Preview !== 'undefined' && Array.isArray(Preview.all) ? Preview.all : [])) applyOptimizationToPreview(preview); } catch (error) {}
    }
    function installRenderHook() {
        if (originalPreviewRender || typeof Preview === 'undefined' || !Preview.prototype?.render) return;
        originalPreviewRender = Preview.prototype.render;
        Preview.prototype.render = function () {
            if (mobileOptimizationEnabled) applyOptimizationToPreview(this);
            const result = originalPreviewRender.apply(this, arguments);
            if (outlinesEnabled) { try { renderScreenSpaceOutline(this); } catch (error) { console.warn('[ICS] Outline render failed:', error); } }
            return result;
        };
    }
    function removeRenderHook() {
        try { if (originalPreviewRender && typeof Preview !== 'undefined' && Preview.prototype?.render) Preview.prototype.render = originalPreviewRender; } catch (error) {}
        originalPreviewRender = null;
    }
    function onCameraPositionUpdate(event) {
        if (mobileOptimizationEnabled) {
            if (event?.preview) applyOptimizationToPreview(event.preview);
            else applyOptimizationToAllPreviews();
        }
    }
    function installCameraListener() {
        if (cameraListenerInstalled || typeof Blockbench?.on !== 'function') return;
        Blockbench.on('update_camera_position', onCameraPositionUpdate);
        cameraListenerInstalled = true;
    }
    function removeCameraListener() {
        try { if (cameraListenerInstalled && Blockbench.removeListener) Blockbench.removeListener('update_camera_position', onCameraPositionUpdate); } catch (error) {}
        cameraListenerInstalled = false;
    }
    function setMobileOptimization(enabled) {
        mobileOptimizationEnabled = !!enabled;
        if (mobileOptimizationEnabled) { installRenderHook(); installCameraListener(); applyOptimizationToAllPreviews(); }
        else { removeRenderHook(); for (const [renderer, ratio] of originalPixelRatios) renderer?.setPixelRatio?.(ratio); originalPixelRatios.clear(); }
        Blockbench.showQuickMessage('ICS Mobile Optimization: ' + (mobileOptimizationEnabled ? 'ON' : 'OFF'));
    }

    const OUTLINE_VERTEX = `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `;
    const OUTLINE_FRAGMENT = `
        uniform sampler2D uMask;
        uniform vec2 uTexel;
        uniform float uRadius;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
            float center = texture2D(uMask, vUv).a;
            float hit = 0.0;
            float radius = max(1.0, uRadius);
            for (int x = -4; x <= 4; x++) {
                for (int y = -4; y <= 4; y++) {
                    float dx = float(x), dy = float(y);
                    if (dx * dx + dy * dy > radius * radius) continue;
                    hit = max(hit, texture2D(uMask, vUv + vec2(dx, dy) * uTexel).a);
                }
            }
            float edge = hit * (1.0 - center);
            if (edge <= 0.001) discard;
            gl_FragColor = vec4(uColor, edge * uOpacity);
        }
    `;

    function createOutlineState(preview) {
        if (!preview?.renderer || typeof THREE === 'undefined') return null;
        if (outlineStates.has(preview)) return outlineStates.get(preview);
        const state = {
            maskScene: new THREE.Scene(),
            maskMaterial: new THREE.MeshBasicMaterial({color: 0xffffff, side: THREE.DoubleSide}),
            maskMeshes: new Map(), target: null,
            overlayScene: new THREE.Scene(),
            overlayCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
            overlayMaterial: null, overlayMesh: null, width: 0, height: 0
        };
        state.overlayMaterial = new THREE.ShaderMaterial({
            uniforms: {uMask: {value: null}, uTexel: {value: new THREE.Vector2(1, 1)}, uRadius: {value: 2}, uColor: {value: new THREE.Color(DEFAULT_OUTLINE_COLOR)}, uOpacity: {value: 1}},
            vertexShader: OUTLINE_VERTEX, fragmentShader: OUTLINE_FRAGMENT,
            transparent: true, depthTest: false, depthWrite: false, toneMapped: false
        });
        state.overlayMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), state.overlayMaterial);
        state.overlayScene.add(state.overlayMesh);
        outlineStates.set(preview, state);
        return state;
    }
    function disposeOutlineState(preview) {
        const state = outlineStates.get(preview); if (!state) return;
        try { state.target?.dispose?.(); state.maskMaterial?.dispose?.(); state.overlayMaterial?.dispose?.(); state.overlayMesh?.geometry?.dispose?.(); } catch (error) {}
        outlineStates.delete(preview);
    }
    function ensureMaskTarget(preview, state) {
        const renderer = preview.renderer, canvas = preview.canvas;
        let width = canvas?.width || 0, height = canvas?.height || 0;
        if ((!width || !height) && renderer.getDrawingBufferSize) { const size = renderer.getDrawingBufferSize(new THREE.Vector2()); width = size.x; height = size.y; }
        width = Math.max(2, Math.floor(width || preview.width || 2));
        height = Math.max(2, Math.floor(height || preview.height || 2));
        if (state.target && state.width === width && state.height === height) return;
        state.target?.dispose?.();
        state.target = new THREE.WebGLRenderTarget(width, height, {minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false});
        state.width = width; state.height = height;
    }

    // Build the mask from the actual rendered Blockbench scene rather than
    // Outliner.elements. This catches nested/grouped/mesh children as well as
    // top-level elements, so every visible model object participates.
    function syncMaskMeshes(state) {
        const seen = new Set();
        const sourceScene = typeof Canvas !== 'undefined' ? Canvas.scene : null;
        if (!sourceScene?.traverse) return;

        sourceScene.updateMatrixWorld?.(true);
        sourceScene.traverse(object => {
            if (!object?.isMesh || !object.geometry) return;
            if (object.visible === false) return;

            const key = object.uuid;
            seen.add(key);
            let maskMesh = state.maskMeshes.get(key);
            if (!maskMesh || maskMesh.geometry !== object.geometry) {
                if (maskMesh) state.maskScene.remove(maskMesh);
                maskMesh = new THREE.Mesh(object.geometry, state.maskMaterial);
                state.maskMeshes.set(key, maskMesh);
                state.maskScene.add(maskMesh);
            }
            object.updateWorldMatrix?.(true, false);
            maskMesh.matrixWorld.copy(object.matrixWorld);
            maskMesh.matrixAutoUpdate = false;
            maskMesh.visible = true;
        });

        for (const [key, maskMesh] of state.maskMeshes) {
            if (!seen.has(key)) {
                state.maskScene.remove(maskMesh);
                state.maskMeshes.delete(key);
            }
        }
    }

    function saveRendererViewport(renderer) {
        const result = {};
        try {
            result.viewport = renderer.getViewport ? renderer.getViewport(new THREE.Vector4()) : null;
            result.scissor = renderer.getScissor ? renderer.getScissor(new THREE.Vector4()) : null;
            result.scissorTest = renderer.getScissorTest ? renderer.getScissorTest() : null;
        } catch (error) {}
        return result;
    }
    function setFullTargetViewport(renderer, state) {
        if (renderer.setViewport) renderer.setViewport(0, 0, state.width, state.height);
        if (renderer.setScissorTest) renderer.setScissorTest(false);
    }
    function restoreRendererViewport(renderer, saved) {
        try {
            if (saved.viewport && renderer.setViewport) renderer.setViewport(saved.viewport.x, saved.viewport.y, saved.viewport.z, saved.viewport.w);
            if (saved.scissor && renderer.setScissor) renderer.setScissor(saved.scissor.x, saved.scissor.y, saved.scissor.z, saved.scissor.w);
            if (saved.scissorTest !== null && saved.scissorTest !== undefined && renderer.setScissorTest) renderer.setScissorTest(saved.scissorTest);
        } catch (error) {}
    }

    function renderScreenSpaceOutline(preview) {
        if (!preview?.renderer || !preview.camera || typeof THREE === 'undefined') return;
        const state = createOutlineState(preview); if (!state) return;
        ensureMaskTarget(preview, state); syncMaskMeshes(state);
        if (!state.maskScene.children.length) return;

        const renderer = preview.renderer;
        const previousTarget = renderer.getRenderTarget?.() || null;
        const previousXr = renderer.xr?.enabled;
        const previousAutoClear = renderer.autoClear;
        const previousClearColor = renderer.getClearColor ? renderer.getClearColor(new THREE.Color()) : null;
        const previousClearAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 0;
        const savedViewport = saveRendererViewport(renderer);
        try {
            if (renderer.xr) renderer.xr.enabled = false;
            state.maskScene.updateMatrixWorld(true);

            // The mask and overlay must use the exact same full drawing-buffer
            // viewport. Otherwise the 2D silhouette and the real preview drift
            // apart, which is what produced the visible offset.
            setFullTargetViewport(renderer, state);
            renderer.setRenderTarget(state.target);
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, true, true);
            renderer.render(state.maskScene, preview.camera);

            state.overlayMaterial.uniforms.uMask.value = state.target.texture;
            state.overlayMaterial.uniforms.uTexel.value.set(1 / state.width, 1 / state.height);
            state.overlayMaterial.uniforms.uRadius.value = clamp(outlineThickness * 18, 1, 4);
            state.overlayMaterial.uniforms.uColor.value.set(outlineColor);
            state.overlayMaterial.uniforms.uOpacity.value = (OUTLINE_STYLES[outlineType] || OUTLINE_STYLES.ink).opacity;

            renderer.setRenderTarget(previousTarget);
            renderer.autoClear = false;
            setFullTargetViewport(renderer, state);
            renderer.render(state.overlayScene, state.overlayCamera);
        } finally {
            renderer.autoClear = previousAutoClear;
            if (renderer.setClearColor && previousClearColor) renderer.setClearColor(previousClearColor, previousClearAlpha);
            if (renderer.xr) renderer.xr.enabled = previousXr;
            renderer.setRenderTarget(previousTarget);
            restoreRendererViewport(renderer, savedViewport);
        }
    }
    function clearAllOutlines() { for (const [preview] of outlineStates) disposeOutlineState(preview); }
    function setOutlinesEnabled(enabled) {
        outlinesEnabled = !!enabled;
        if (outlinesEnabled) { installRenderHook(); installCameraListener(); }
        else { clearAllOutlines(); if (!mobileOptimizationEnabled) { removeRenderHook(); removeCameraListener(); } }
        Blockbench.showQuickMessage('ICS Outlines: ' + (outlinesEnabled ? 'ON' : 'OFF'));
    }
    function openOutlineSettings() {
        const dialog = new Dialog({id: 'ics_outline_settings', title: 'ICS Outline Settings', form: {
            type: {label: 'Outline Type', type: 'select', options: {hazard_shell: 'Hazard Shell', ink: 'Ink', sketch: 'Sketch'}, value: outlineType},
            thickness: {label: 'Outline Size', type: 'range', min: 0.01, max: 0.5, step: 0.01, value: outlineThickness},
            color: {label: 'Outline Color', type: 'color', value: outlineColor}
        }, onConfirm(form) {
            if (OUTLINE_STYLES[form.type]) outlineType = form.type;
            if (Number.isFinite(Number(form.thickness))) outlineThickness = clamp(Number(form.thickness), 0.01, 0.5);
            if (/^#[0-9a-f]{6}$/i.test(String(form.color || ''))) outlineColor = String(form.color);
            saveOutlineSettings(); Blockbench.showQuickMessage('ICS ' + (OUTLINE_STYLES[outlineType]?.name || 'Outline') + ' Applied');
        }}); dialog.show();
    }
    let mobileAction, outlineAction, settingsAction;
    Plugin.register(PLUGIN_ID, {
        title: 'Immortal Cursed Spirit', author: 'Yama Sung',
        description: 'Mobile optimization and camera-correct 2D silhouette outlines for Blockbench.', icon: 'visibility', version: VERSION, variant: 'both', min_version: '4.12.0',
        onload() {
            loadOutlineSettings();
            mobileAction = new Action(MOBILE_OPTIMIZER_ACTION_ID, {name: 'ICS Mobile Optimization: Toggle', icon: 'speed', click: () => setMobileOptimization(!mobileOptimizationEnabled)});
            outlineAction = new Action(OUTLINE_ACTION_ID, {name: 'ICS Outlines: Toggle', icon: 'border_style', click: () => setOutlinesEnabled(!outlinesEnabled)});
            settingsAction = new Action(OUTLINE_SETTINGS_ACTION_ID, {name: 'ICS Outline Settings', icon: 'tune', click: openOutlineSettings});
            MenuBar.menus.tools.addAction(mobileAction); MenuBar.menus.tools.addAction(outlineAction); MenuBar.menus.tools.addAction(settingsAction);
        },
        onunload() {
            setMobileOptimization(false); outlinesEnabled = false; clearAllOutlines(); removeRenderHook(); removeCameraListener();
            safeDelete(mobileAction); safeDelete(outlineAction); safeDelete(settingsAction);
            mobileAction = null; outlineAction = null; settingsAction = null;
        }
    });
})();
