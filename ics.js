// ICS — Immortal Cursed Spirit
// DODFP experiment: 3D scene -> offscreen 2D texture -> texture on a 3D surface -> visible render.
// UI direction: dark, technical, restrained cursed-spirit creator aesthetic.

(function () {
	'use strict';

	let installed = false;
	let surfaceEnabled = false;
	const states = new WeakMap();
	const TARGET_SIZE = 256;
	let surface;

	function getPreviews() {
		return (typeof Preview !== 'undefined' && Array.isArray(Preview.all))
			? Preview.all
			: [];
	}

	function createSurface() {
		if (surface || typeof THREE === 'undefined' || !Canvas?.scene) return surface;

		const geometry = new THREE.PlaneGeometry(6, 6);
		const material = new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			depthTest: false,
			color: 0xffffff
		});
		surface = new THREE.Mesh(geometry, material);
		surface.name = 'ICS_DODFP_Surface';
		surface.visible = false;
		Canvas.scene.add(surface);
		return surface;
	}

	function removeSurface() {
		if (!surface) return;
		if (surface.parent) surface.parent.remove(surface);
		surface.geometry.dispose();
		surface.material.dispose();
		surface = undefined;
	}

	function updateSurface(preview, texture) {
		if (!surface || !surfaceEnabled) return;
		const material = surface.material;
		material.map = texture;
		material.needsUpdate = true;
		surface.visible = true;

		// Keep the surface in a predictable camera-facing location so it is
		// actually observable without making assumptions about the model scale.
		const camera = preview.camera;
		const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
		surface.position.copy(camera.position).add(direction.multiplyScalar(8));
		surface.quaternion.copy(camera.quaternion);
	}

	function installPreview(preview) {
		if (!preview || !preview.renderer || states.has(preview)) return false;

		const renderer = preview.renderer;
		if (typeof THREE === 'undefined' || !THREE.WebGLRenderTarget) {
			console.error('[ICS] Three.js WebGLRenderTarget is unavailable.');
			return false;
		}

		const target = new THREE.WebGLRenderTarget(TARGET_SIZE, TARGET_SIZE, {
			minFilter: THREE.LinearFilter,
			magFilter: THREE.LinearFilter,
			format: THREE.RGBAFormat,
			depthBuffer: true,
			stencilBuffer: false
		});
		target.texture.name = 'ICS_DODFP_Offscreen';

		const originalRender = preview.render.bind(preview);
		const state = { target, originalRender, rendering: false };
		states.set(preview, state);

		preview.render = function () {
			if (state.rendering) return originalRender();
			state.rendering = true;

			try {
				const oldSurfaceVisible = surface ? surface.visible : false;
				if (surface) surface.visible = false;

				// Stage 1: render the real Blockbench scene into a 256×256 texture.
				renderer.setRenderTarget(target);
				renderer.clear();
				renderer.render(Canvas.scene, preview.camera);
				renderer.setRenderTarget(null);

				// Stage 2: use that 2D texture as data on a real 3D plane.
				if (surfaceEnabled) updateSurface(preview, target.texture);
				else if (surface) surface.visible = oldSurfaceVisible;

				// Stage 3: render the normal Blockbench scene again, now with the
				// optional DODFP surface carrying the previous image-space result.
				originalRender();
			} catch (error) {
				console.error('[ICS] DODFP bridge failed:', error);
				try { renderer.setRenderTarget(null); } catch (_) {}
				originalRender();
			} finally {
				state.rendering = false;
			}
		};

		console.info('[ICS] DODFP bridge installed:', {
			preview,
			renderer,
			renderTarget: target,
			texture: target.texture
		});
		return true;
	}

	function install() {
		createSurface();
		let count = 0;
		getPreviews().forEach(preview => {
			if (installPreview(preview)) count++;
		});
		installed = true;
		Blockbench.showQuickMessage('ICS DODFP probe: ' + count + ' preview(s) connected');
	}

	function uninstall() {
		getPreviews().forEach(preview => {
			const state = states.get(preview);
			if (!state) return;
			preview.render = state.originalRender;
			state.target.dispose();
			states.delete(preview);
		});
		installed = false;
		surfaceEnabled = false;
		removeSurface();
	}

	function openCreator() {
		new Dialog({
			id: 'ics_creator',
			title: 'ICS — Cursed Spirit Creator',
			width: 430,
			darken: true,
			form: {
				identity: {
					type: 'info',
					text: '**IMMORTAL CURSED SPIRIT**\n\nThe first real DODFP bridge is active: Blockbench geometry is rendered to a 2D texture, then that texture is fed back onto a 3D surface.'
				},
				state: {
					type: 'info',
					text: `**Probe:** ${installed ? 'CONNECTED' : 'DORMANT'}\n**Surface:** ${surfaceEnabled ? 'VISIBLE' : 'HIDDEN'}`
				},
				enable: {
					type: 'checkbox',
					label: 'Enable DODFP probe',
					description: 'Creates the offscreen 2D render texture while preserving the normal Blockbench renderer.',
					value: installed
				},
				surface: {
					type: 'checkbox',
					label: 'Show 2D → 3D surface',
					description: 'Displays a real 3D plane carrying the offscreen texture in the preview camera.',
					value: surfaceEnabled
				},
				buffer: {
					type: 'info',
					text: `**2D buffer:** ${TARGET_SIZE} × ${TARGET_SIZE} RGBA · depth enabled\n**Return path:** texture → THREE.Mesh plane → render`
				},
				warning: {
					type: 'info',
					text: '*Experimental specimen. Small buffers and a simple surface are intentional for Android/mobile stability.*'
				}
			},
			buttons: ['Apply', 'Cancel'],
			onConfirm(form) {
				if (form.enable) {
					if (!installed) install();
					surfaceEnabled = !!form.surface;
					createSurface();
					if (surface) surface.visible = surfaceEnabled;
				} else {
					if (installed) uninstall();
				}
			}
		}).show();
	}

	const action = new Action('ics_dodfp_probe', {
		name: 'ICS: DODFP Probe',
		icon: 'memory',
		click() {
			if (installed) {
				uninstall();
				Blockbench.showQuickMessage('ICS DODFP probe removed');
			} else {
				install();
			}
		}
	});

	const creatorAction = new Action('ics_cursed_spirit_creator', {
		name: 'ICS: Cursed Spirit Creator',
		icon: 'auto_fix_high',
		click: openCreator
	});

	Plugin.register('ics', {
		title: 'ICS — Immortal Cursed Spirit',
		author: 'TFO',
		description: 'Experimental DODFP rendering bridge for Blockbench.',
		about: 'Experimental 3D → 2D → 3D rendering bridge using Blockbench\'s real WebGLRenderer and a Three.js texture surface.',
		version: '0.3.0',
		icon: 'memory',
		variant: 'both',
		min_version: '4.0.0',
		onload() {
			MenuBar.view.addAction(creatorAction);
			MenuBar.view.addAction(action);
		},
		oninstall() {},
		onuninstall() {
			this.onunload();
		},
		onunload() {
			uninstall();
			creatorAction.delete();
			action.delete();
		}
	});
})();
