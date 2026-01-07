import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupSubcomponents } from './editor-subcomponents.js';

/* =============================
   CONFIG
============================= */
const CFG = {
  bg: 0xf2f2f7,
  objColor: 0xdbe4eb,
  objEdge: 0xffffff,
  selColor: 0xFF9500,
  selEdge: 0xFFB84D,
  subAccent: 0x00BFFF,
  minScale: 0.05,
  maxScale: 10.0,
  minZoom: 2,
  maxZoom: 80,
  maxDistance: 40,
  arrowSize: 2.6
};

const IS_MOBILE = matchMedia('(pointer: coarse)').matches || Math.min(window.innerWidth, window.innerHeight) < 700;

/* =============================
   DOM
============================= */
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btn-start');
const themeLight = document.getElementById('theme-light');
const themeDark = document.getElementById('theme-dark');
const renderBar = document.getElementById('render-bar');
const cameraBar = document.getElementById('camera-bar');
const btnExit = document.getElementById('exit-manipulation');
const spaceToggle = document.getElementById('space-toggle');
const spaceIcon = document.getElementById('space-icon');
const spaceText = document.getElementById('space-text');
const editValuesBtn = document.getElementById('edit-values-btn');
const subtoolbar = document.getElementById('subtoolbar');
const btnSubVerts = document.getElementById('sub-verts');
const btnSubEdges = document.getElementById('sub-edges');
const btnSubFaces = document.getElementById('sub-faces');
const btnSubExplode = document.getElementById('sub-explode');
const btnSubClear = document.getElementById('sub-clear');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const confirmDialog = document.getElementById('confirm-dialog');
const btnCancel = document.getElementById('btn-cancel');
const btnOk = document.getElementById('btn-ok');
const axisDialog = document.getElementById('axis-input-dialog');
const axisTitle = document.getElementById('axis-title');
const axisSubtitle = document.getElementById('axis-subtitle');
const inputX = document.getElementById('input-x');
const inputY = document.getElementById('input-y');
const inputZ = document.getElementById('input-z');
const btnApply = document.getElementById('btn-apply');
const btnClose = document.getElementById('btn-close');
const measurementLine = document.getElementById('measurement-line');
const distanceLabel = document.getElementById('distance-label');
const measureLine = document.getElementById('measure-line');
const originDot = document.getElementById('origin-dot');
const editCamPanel = document.getElementById('edit-cam-panel');
const btnCamZoom = document.getElementById('btn-cam-zoom');
const btnCamOrbit = document.getElementById('btn-cam-orbit');
const toolbar = document.getElementById('toolbar');
const btnDelete = document.getElementById('btn-delete');
const btnColor = document.getElementById('btn-color');

/* =============================
   THREE CORE
============================= */
let scene, camera, renderer, orbit;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const objects = [];
let nextObjectId = 1;
let gridTexture = null;
let currentRenderMode = 'flat';

/* =============================
   STATE
============================= */
let selectedObject = null;
let currentMode = 'translate'; 
let currentSpace = 'world';    
let currentGizmo = null;
let activeHandle = null;
let isDragging = false;
let dragStart = new THREE.Vector2();
let touchStart = new THREE.Vector2();
let lastTapTime = 0;
let originPosition = new THREE.Vector3();
let isEditMode = false;
let editZoomEnabled = false;
let editOrbitEnabled = false;

// NUEVOS ESTADOS
let clipboard = null;
let isMultiSelect = false;

/* =============================
   FUNCTIONS
============================= */
function setEditMode(on) {
  isEditMode = on;
  if (on) {
    editZoomEnabled = false;
    editOrbitEnabled = false;
    editCamPanel.classList.add('visible');
    btnCamZoom.classList.toggle('active', editZoomEnabled);
    btnCamOrbit.classList.toggle('active', editOrbitEnabled);
    applyCameraLocks();
  } else {
    editCamPanel.classList.remove('visible');
    orbit.enableZoom = true;
    orbit.enableRotate = true;
    orbit.enablePan = true;
  }
}

function applyCameraLocks() {
  if (!isEditMode) return;
  orbit.enableZoom = !!editZoomEnabled;
  orbit.enableRotate = !!editOrbitEnabled;
  orbit.enablePan = false;
}

/* =============================
   COPY / PASTE SYSTEM
============================= */
function copyObject() {
  if (!selectedObject) return;
  clipboard = {
    type: selectedObject.userData.primType,
    state: snapshotTransform(selectedObject),
    color: selectedObject.userData.originalColor
  };
}

function pasteObject() {
  if (!clipboard) return;
  const id = nextObjectId++;
  const mesh = createPrimitive(clipboard.type, id);
  applySnapshot(mesh, clipboard.state);
  mesh.position.x += 1.5; 
  mesh.userData.originalColor = clipboard.color;
  mesh.material.color.setHex(clipboard.color);
  scene.add(mesh);
  objects.push(mesh);
  applyRenderMode(mesh, currentRenderMode);
  pushAction({
    type: 'add',
    items: [{ prim: { type: clipboard.type, id }, state: snapshotTransform(mesh) }]
  });
  selectedObject = mesh;
  applySelectionUI();
}

/* =============================
   UNDO / REDO
============================= */
const undoStack = [];
const redoStack = [];

function updateUndoRedoUI() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

function pushAction(action) {
  undoStack.push(action);
  redoStack.length = 0;
  updateUndoRedoUI();
}

function snapshotTransform(obj) {
  return {
    pos: obj.position.toArray(),
    quat: obj.quaternion.toArray(),
    scl: obj.scale.toArray()
  };
}

function applySnapshot(obj, snap) {
  obj.position.fromArray(snap.pos);
  obj.quaternion.fromArray(snap.quat);
  obj.scale.fromArray(snap.scl);
  obj.rotation.setFromQuaternion(obj.quaternion);
}

function findById(id) {
  return objects.find(o => o.userData?.id === id) || null;
}

function removeObjectFromScene(obj) {
  scene.remove(obj);
  const i = objects.indexOf(obj);
  if (i >= 0) objects.splice(i, 1);
}

function performForward(a) {
  if (a.type === 'add') {
    for (const item of a.items) {
      const obj = createPrimitive(item.prim.type, item.prim.id);
      applySnapshot(obj, item.state);
      scene.add(obj);
      objects.push(obj);
      applyRenderMode(obj, currentRenderMode);
    }
  } else if (a.type === 'delete') {
    for (const id of a.ids) {
      const obj = findById(id);
      if (obj) removeObjectFromScene(obj);
    }
    deselectAll();
  } else if (a.type === 'transform') {
    const obj = findById(a.id);
    if (obj) applySnapshot(obj, a.after);
  } else if (a.type === 'subEdit') {
    subAPI.applySubEditForward(a);
  }
}

function performInverse(a) {
  if (a.type === 'add') {
    for (const item of a.items) {
      const obj = findById(item.prim.id);
      if (obj) removeObjectFromScene(obj);
    }
    deselectAll();
  } else if (a.type === 'delete') {
    for (const item of a.items) {
      const obj = createPrimitive(item.prim.type, item.prim.id);
      applySnapshot(obj, item.state);
      scene.add(obj);
      objects.push(obj);
      applyRenderMode(obj, currentRenderMode);
    }
  } else if (a.type === 'transform') {
    const obj = findById(a.id);
    if (obj) applySnapshot(obj, a.before);
  } else if (a.type === 'subEdit') {
    subAPI.applySubEditInverse(a);
  }
}

function undo() {
  const a = undoStack.pop();
  if (!a) return;
  redoStack.push(a);
  performInverse(a);
  updateUndoRedoUI();
}

function redo() {
  const a = redoStack.pop();
  if (!a) return;
  undoStack.push(a);
  performForward(a);
  updateUndoRedoUI();
}

/* =============================
   VIEWPORT HELPERS
============================= */
function isWorldPointOffscreen(worldPoint, margin = 0.12) {
  const v = worldPoint.clone().project(camera);
  const m = margin * 2;
  return (v.x < -1 + m) || (v.x > 1 - m) || (v.y < -1 + m) || (v.y > 1 - m);
}

function getCameraDir() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return d.normalize();
}

/* =============================
   DRAG PLANE
============================= */
let dragState = null;

function intersectPlane(screenX, screenY, plane) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const p = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(plane, p);
  return ok ? p : null;
}

function axisToVec(a) {
  if (a === 'x') return new THREE.Vector3(1, 0, 0);
  if (a === 'y') return new THREE.Vector3(0, 1, 0);
  if (a === 'z') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(1, 0, 0);
}

function makeAxisDragPlane(axisDirW, anchorPointW) {
  const camDir = getCameraDir();
  let n = new THREE.Vector3().crossVectors(axisDirW, camDir);
  if (n.lengthSq() < 1e-8) {
    n = new THREE.Vector3().crossVectors(axisDirW, new THREE.Vector3(0, 1, 0));
    if (n.lengthSq() < 1e-8) n = new THREE.Vector3().crossVectors(axisDirW, new THREE.Vector3(1, 0, 0));
  }
  const planeNormal = new THREE.Vector3().crossVectors(n, axisDirW).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, anchorPointW);
}

function beginTranslateDrag(axis, anchorW, centerW, objRadius) {
  let plane;
  let axisDirW = null;
  if (axis === 'free') {
    plane = new THREE.Plane().setFromNormalAndCoplanarPoint(getCameraDir(), anchorW);
  } else {
    axisDirW = axisToVec(axis);
    if (currentSpace === 'local' && selectedObject) axisDirW.applyQuaternion(selectedObject.quaternion).normalize();
    plane = makeAxisDragPlane(axisDirW, anchorW);
  }
  const startHit = intersectPlane(dragStart.x, dragStart.y, plane) || anchorW.clone();
  dragState = {
    plane,
    startHit,
    axisDirW,
    baseCamDist: camera.position.distanceTo(centerW),
    objRadius,
    anchorCenterW: centerW.clone()
  };
}

function updateIntelligentZoomFromMoved(movedDistance) {
  if (!dragState) return;
  if (!isWorldPointOffscreen(dragState.anchorCenterW, 0.10)) return;
  const sizeFactor = Math.max(1, dragState.objRadius * 1.4);
  const target = dragState.baseCamDist + (movedDistance * 0.85) + (movedDistance / (sizeFactor * 2.0));
  const clamped = THREE.MathUtils.clamp(target, CFG.minZoom, CFG.maxZoom);
  const current = camera.position.distanceTo(dragState.anchorCenterW);
  const newDist = THREE.MathUtils.lerp(current, clamped, 0.10);
  const dir = camera.position.clone().sub(dragState.anchorCenterW).normalize();
  camera.position.copy(dragState.anchorCenterW.clone().add(dir.multiplyScalar(newDist)));
  orbit.target.copy(dragState.anchorCenterW);
  camera.lookAt(dragState.anchorCenterW);
  orbit.update();
}

/* =============================
   CAMERA PRESETS
============================= */
function fitBox(box) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const fitDist = (maxSize * 0.5) / Math.tan(fov * 0.5);
  const dist = THREE.MathUtils.clamp(fitDist * 2.4, CFG.minZoom, CFG.maxZoom);
  const dir = new THREE.Vector3(1, 0.85, 1).normalize();
  orbit.target.copy(center);
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  camera.lookAt(center);
  orbit.update();
}

function fitAll() {
  if (!objects.length) return;
  const box = new THREE.Box3();
  objects.forEach(o => box.expandByObject(o));
  fitBox(box);
}

function focusSelected() {
  if (!selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  fitBox(box);
}

function snapView(name) {
  const t = selectedObject ? new THREE.Box3().setFromObject(selectedObject).getCenter(new THREE.Vector3()) : orbit.target.clone();
  const dist = THREE.MathUtils.clamp(camera.position.distanceTo(orbit.target), CFG.minZoom, CFG.maxZoom);
  let dir = new THREE.Vector3(1, 1, 1).normalize();
  if (name === 'top') dir = new THREE.Vector3(0, 1, 0);
  if (name === 'front') dir = new THREE.Vector3(0, 0, 1);
  if (name === 'right') dir = new THREE.Vector3(1, 0, 0);
  orbit.target.copy(t);
  camera.position.copy(t.clone().add(dir.multiplyScalar(dist)));
  camera.lookAt(t);
  orbit.update();
}

function focusSelectedSoft() {
  if (!selectedObject) return;
  const box = new THREE.Box3().setFromObject(selectedObject);
  const center = box.getCenter(new THREE.Vector3());
  if (!isWorldPointOffscreen(center, 0.10)) return;
  orbit.target.lerp(center, 0.22);
  if (IS_MOBILE) { orbit.update(); return; }
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const currentDist = camera.position.distanceTo(orbit.target);
  const desiredMin = Math.max(CFG.minZoom, maxSize * 1.8);
  const desiredMax = Math.min(CFG.maxZoom, maxSize * 10.0);
  const clampedDist = THREE.MathUtils.clamp(currentDist, desiredMin, desiredMax);
  const dir = camera.position.clone().sub(orbit.target).normalize();
  const newDist = THREE.MathUtils.lerp(currentDist, clampedDist, 0.12);
  camera.position.copy(orbit.target.clone().add(dir.multiplyScalar(newDist)));
  camera.lookAt(orbit.target);
  orbit.update();
}

/* =============================
   GIZMOS
============================= */
function removeGizmo() {
  if (currentGizmo) {
    scene.remove(currentGizmo);
    currentGizmo = null;
  }
}

function createTranslateGizmo() {
  const gizmo = new THREE.Group();
  const L = CFG.arrowSize;
  const ax = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), L, 0xFF3B30, 0.6, 0.4);
  ax.userData.axis = 'x';
  const ay = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), L, 0x34C759, 0.6, 0.4);
  ay.userData.axis = 'y';
  const az = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), L, 0x007AFF, 0.6, 0.4);
  az.userData.axis = 'z';
  const center = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
  center.userData.axis = 'free';
  gizmo.add(ax, ay, az, center);
  gizmo.traverse(c => { if (c.material) { c.material.depthTest = false; c.material.depthWrite = false; c.renderOrder = 999; }});
  return gizmo;
}

function createRotateGizmo() {
  const gizmo = new THREE.Group();
  const r = 2.0;
  const ringX = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: 0xFF3B30, transparent: true, opacity: 0.85, depthTest: false }));
  ringX.rotation.y = Math.PI / 2; ringX.userData.axis = 'x';
  const ringY = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: 0x34C759, transparent: true, opacity: 0.85, depthTest: false }));
  ringY.rotation.x = Math.PI / 2; ringY.userData.axis = 'y';
  const ringZ = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: 0x007AFF, transparent: true, opacity: 0.85, depthTest: false }));
  ringZ.userData.axis = 'z';
  gizmo.add(ringX, ringY, ringZ);
  gizmo.traverse(c => { if (c.material) { c.material.depthTest = false; c.renderOrder = 999; }});
  return gizmo;
}

function createScaleGizmo() {
  const gizmo = new THREE.Group();
  const len = 2.0; const s = 0.3;
  function handle(color, axis, pos) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
    h.position.copy(pos); h.userData.axis = axis; return h;
  }
  const hx = handle(0xFF3B30, 'x', new THREE.Vector3(len, 0, 0));
  const hy = handle(0x34C759, 'y', new THREE.Vector3(0, len, 0));
  const hz = handle(0x007AFF, 'z', new THREE.Vector3(0, 0, len));
  const hu = handle(0xffffff, 'uniform', new THREE.Vector3(0, 0, 0));
  gizmo.add(hx, hy, hz, hu);
  gizmo.traverse(c => { if (c.material) { c.material.depthTest = false; c.renderOrder = 999; }});
  return gizmo;
}

function createGizmoFor(mode, position, targetObject, gizmoScale = 1.0) {
  removeGizmo();
  if (mode === 'translate' || mode === 'select') currentGizmo = createTranslateGizmo();
  else if (mode === 'rotate') currentGizmo = createRotateGizmo();
  else if (mode === 'scale') currentGizmo = createScaleGizmo();
  else return null;
  currentGizmo.position.copy(position);
  if (targetObject && currentSpace === 'local') currentGizmo.quaternion.copy(targetObject.quaternion);
  currentGizmo.scale.setScalar(gizmoScale);
  scene.add(currentGizmo);
  return currentGizmo;
}

function updateGizmoPose() {
  if (!currentGizmo || !selectedObject) return;
  if (currentMode === 'select') {
    const p = subAPI.getSelectionWorldCenter();
    if (p) currentGizmo.position.copy(p);
  } else {
    currentGizmo.position.copy(selectedObject.position);
  }
  if (currentSpace === 'local') currentGizmo.quaternion.copy(selectedObject.quaternion);
  else currentGizmo.quaternion.identity();
}

/* =============================
   SELECTION VISUALS
============================= */
function setObjectSelectedVisual(obj, on) {
  if (!obj?.material) return;
  if (on) {
    obj.material.color.setHex(CFG.selColor);
    if (obj.userData.edges) { obj.userData.edges.material.color.setHex(CFG.selEdge); obj.userData.edges.material.opacity = 0.85; }
  } else {
    obj.material.color.setHex(obj.userData.originalColor ?? CFG.objColor);
    if (obj.userData.edges) { obj.userData.edges.material.color.setHex(CFG.objEdge); obj.userData.edges.material.opacity = 0.5; }
  }
}

function applySelectionUI() {
  objects.forEach(o => setObjectSelectedVisual(o, false));
  if (selectedObject) {
    setObjectSelectedVisual(selectedObject, true);
    btnExit.classList.add('visible');
    spaceToggle.classList.add('visible');
    editValuesBtn.classList.add('visible');
    setEditMode(true);
    if (currentMode === 'select') {
      subtoolbar.classList.add('visible');
      subAPI.applySubVisibility(selectedObject);
      const center = subAPI.getSelectionWorldCenter();
      if (center) createGizmoFor('translate', center, selectedObject, 0.5);
      else removeGizmo();
    } else {
      subtoolbar.classList.remove('visible');
      createGizmoFor(currentMode, selectedObject.position, selectedObject, 1.0);
    }
    updateEditButtonPosition();
    focusSelectedSoft();
  } else {
    btnExit.classList.remove('visible');
    spaceToggle.classList.remove('visible');
    editValuesBtn.classList.remove('visible');
    subtoolbar.classList.remove('visible');
    subAPI.clearSelection();
    setEditMode(false);
    removeGizmo();
    hideConfirm();
  }
}

function deselectAll() {
  selectedObject = null;
  subAPI?.clearSelection?.();
  applySelectionUI();
}

function setMode(mode) {
  currentMode = mode;
  toolbar.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
  const btn = toolbar.querySelector(`[data-mode="${mode}"]`);
  if (btn) btn.classList.add('active');
  applySelectionUI();
}

/* =============================
   AXIS DIALOG
============================= */
function openAxisDialog() {
  if (!selectedObject) return;
  axisDialog.classList.add('visible');
}

function closeAxisDialog() {
  axisDialog.classList.remove('visible');
}

btnApply.addEventListener('click', () => {
  if (!selectedObject) return;
  const before = snapshotTransform(selectedObject);
  const x = parseFloat(inputX.value), y = parseFloat(inputY.value), z = parseFloat(inputZ.value);
  if (currentMode === 'translate') selectedObject.position.set(x, y, z);
  else if (currentMode === 'rotate') selectedObject.rotation.set(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180);
  else if (currentMode === 'scale') selectedObject.scale.set(x, y, z);
  updateGizmoPose();
  const after = snapshotTransform(selectedObject);
  pushAction({ type: 'transform', id: selectedObject.userData.id, before, after });
  closeAxisDialog();
});

/* =============================
   OBJECT CREATION
============================= */
function createPrimitive(type, id) {
  let geo;
  if (type === 'box') geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  else if (type === 'sphere') geo = new THREE.SphereGeometry(0.9, 48, 48);
  else geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
  const mat = new THREE.MeshStandardMaterial({ color: CFG.objColor, roughness: 0.45, metalness: 0.08, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.id = id;
  mesh.userData.primType = type;
  mesh.userData.originalColor = CFG.objColor;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: CFG.objEdge, transparent: true, opacity: 0.5 }));
  mesh.add(edges);
  mesh.userData.edges = edges;
  return mesh;
}

function spawn(type) {
  const id = nextObjectId++;
  const mesh = createPrimitive(type, id);
  mesh.position.set(0, 0.75, 0);
  scene.add(mesh);
  objects.push(mesh);
  pushAction({ type: 'add', items: [{ prim: { type, id }, state: snapshotTransform(mesh) }] });
}

/* =============================
   RENDER MODE
============================= */
function applyRenderMode(mesh, mode) {
  const m = mesh.material;
  if (mode === 'clay') m.roughness = 1.0;
  else m.roughness = 0.45;
  m.needsUpdate = true;
}

/* =============================
   POINTER EVENTS
============================= */
function handleDoubleTap(x, y) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (currentMode === 'select' && selectedObject) {
    const changed = subAPI.togglePick(raycaster, selectedObject);
    if (changed) {
      const center = subAPI.getSelectionWorldCenter();
      if (center) {
        createGizmoFor('translate', center, selectedObject, 0.5);
        showConfirm();
      } else { removeGizmo(); hideConfirm(); }
      return;
    }
  }

  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length) {
    selectedObject = hits[0].object;
    applySelectionUI();
  } else { deselectAll(); }
}

function manipulateByGizmo(x, y) {
  if (!activeHandle || !selectedObject) return;
  const axis = activeHandle.userData.axis;

  if (currentMode === 'select' && subAPI.hasSelection()) {
    if (!dragState) return;
    const hit = intersectPlane(x, y, dragState.plane);
    if (!hit) return;
    let worldDelta = hit.clone().sub(dragState.startHit);
    if (dragState.axisDirW) worldDelta = dragState.axisDirW.clone().multiplyScalar(worldDelta.dot(dragState.axisDirW));
    subAPI.applySelectionWorldDelta(selectedObject, worldDelta);
    updateGizmoPose();
    dragState.startHit.copy(hit);
    dragStart.set(x, y);
    return;
  }

  if (currentMode === 'translate') {
    if (!dragState) return;
    const hit = intersectPlane(x, y, dragState.plane);
    if (!hit) return;
    let worldDelta = hit.clone().sub(dragState.startHit);
    if (dragState.axisDirW) worldDelta = dragState.axisDirW.clone().multiplyScalar(worldDelta.dot(dragState.axisDirW));
    selectedObject.position.add(worldDelta);
    updateGizmoPose();
    dragState.startHit.copy(hit);
    dragStart.set(x, y);
  }
}

function setupPointerEvents() {
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    touchStart.set(e.clientX, e.clientY);
    dragStart.set(e.clientX, e.clientY);
    if (selectedObject && currentGizmo) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(currentGizmo, true);
      if (hits.length) {
        activeHandle = hits[0].object;
        while(activeHandle.parent && activeHandle.parent !== currentGizmo) activeHandle = activeHandle.parent;
        isDragging = true; orbit.enabled = false;
        const anchorW = (currentMode === 'select') ? subAPI.getSelectionWorldCenter() : currentGizmo.position.clone();
        beginTranslateDrag(activeHandle.userData.axis, anchorW, selectedObject.position, 1.0);
      }
    }
  });
  canvas.addEventListener('pointermove', (e) => { if (isDragging) manipulateByGizmo(e.clientX, e.clientY); });
  canvas.addEventListener('pointerup', (e) => {
    isDragging = false; activeHandle = null; orbit.enabled = true;
    if (Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) < 15) {
      const now = Date.now();
      if (now - lastTapTime < 400) handleDoubleTap(e.clientX, e.clientY);
      lastTapTime = now;
    }
  });
}

function showConfirm() { confirmDialog.classList.add('visible'); }
function hideConfirm() { confirmDialog.classList.remove('visible'); }

function init() {
  scene = new THREE.Scene(); scene.background = new THREE.Color(CFG.bg);
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000); camera.position.set(5, 6, 8);
  renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));
  const grid = new THREE.GridHelper(100, 100); scene.add(grid);
  orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true;
  subAPI = setupSubcomponents({ THREE, CFG, scene, camera, renderer, findObjectById: findById });
  setupPointerEvents();
  
  // LISTENERS BOTONES
  btnStart.addEventListener('click', () => { overlay.style.display = 'none'; spawn('box'); });
  btnExit.addEventListener('click', deselectAll);
  btnUndo.addEventListener('click', undo);
  btnRedo.addEventListener('click', redo);
  btnCancel.addEventListener('click', () => { subAPI.cancelToBaseline(); hideConfirm(); });
  btnOk.addEventListener('click', () => { const action = subAPI.commitSelectionDeltaAsAction(selectedObject?.userData?.id); if(action) pushAction(action); hideConfirm(); });
  toolbar.querySelectorAll('[data-spawn]').forEach(b => b.addEventListener('click', () => spawn(b.dataset.spawn)));
  toolbar.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  
  // NUEVOS BOTONES
  document.getElementById('btn-copy').addEventListener('click', copyObject);
  document.getElementById('btn-paste').addEventListener('click', pasteObject);
  const btnMulti = document.getElementById('sel-multi');
  const btnSingle = document.getElementById('sel-single');
  btnMulti.addEventListener('click', () => { isMultiSelect = true; btnMulti.classList.add('active'); btnSingle.classList.remove('active'); });
  btnSingle.addEventListener('click', () => { isMultiSelect = false; btnSingle.classList.add('active'); btnMulti.classList.remove('active'); });
}

function updateEditButtonPosition() {
  if (!selectedObject) return;
  const v = selectedObject.position.clone().project(camera);
  editValuesBtn.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
  editValuesBtn.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
}

let subAPI;
init();
function animate() { requestAnimationFrame(animate); orbit.update(); if (selectedObject) updateEditButtonPosition(); renderer.render(scene, camera); }
animate();
