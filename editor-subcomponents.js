export function setupSubcomponents(api) {
  const { THREE, CFG, scene, findObjectById } = api;

  const state = {
    flags: { verts: true, edges: false, faces: false, explode: false },
    selection: [], 
    baseline: null 
  };

  function setBaselineFromCurrent() {
    const obj = getSelectedObject();
    if (!obj) return;
    const pos = obj.geometry?.attributes?.position;
    state.baseline = { id: obj.userData.id, positions: new Float32Array(pos.array) };
  }

  function getSelectedObject() {
    if (state.baseline?.id != null) return findObjectById(state.baseline.id);
    return null;
  }

  function keyForPos(x, y, z) {
    const eps = 1e-4;
    return `${Math.round(x/eps)}_${Math.round(y/eps)}_${Math.round(z/eps)}`;
  }

  function togglePick(raycaster, obj) {
    const multi = document.getElementById('sel-multi').classList.contains('active');
    if (!state.baseline || state.baseline.id !== obj.userData.id) setBaselineFromCurrent();

    const hits = raycaster.intersectObject(obj.userData.sub.vertexPoints, true);
    if (hits.length) {
      const idx = hits[0].index;
      const pos = obj.geometry.attributes.position;
      const k = keyForPos(pos.getX(idx), pos.getY(idx), pos.getZ(idx));
      
      if (!multi) state.selection = [];

      const existing = state.selection.findIndex(s => s.key === k);
      if (existing >= 0) state.selection.splice(existing, 1);
      else {
        const indices = [];
        for(let i=0; i<pos.count; i++) if(keyForPos(pos.getX(i), pos.getY(i), pos.getZ(i)) === k) indices.push(i);
        state.selection.push({ 
          key: k, indices, 
          centroidLocal: new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)) 
        });
      }
      recolorSelection(obj);
      return true;
    }
    return false;
  }

  function recolorSelection(obj) {
    const pts = obj.userData.sub.vertexPoints;
    const col = pts.geometry.attributes.color;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, 1, 1, 1);
    state.selection.forEach(s => s.indices.forEach(i => col.setXYZ(i, 0.2, 0.7, 1.0)));
    col.needsUpdate = true;
  }

  function getSelectionWorldCenter() {
    const obj = getSelectedObject();
    if (!obj || state.selection.length === 0) return null;
    const c = new THREE.Vector3();
    state.selection.forEach(s => c.add(obj.localToWorld(s.centroidLocal.clone())));
    return c.multiplyScalar(1 / state.selection.length);
  }

  function applySelectionWorldDelta(obj, worldDelta) {
    const p0 = obj.worldToLocal(new THREE.Vector3(0,0,0));
    const p1 = obj.worldToLocal(worldDelta.clone());
    const dLocal = p1.sub(p0);
    const pos = obj.geometry.attributes.position;
    const unique = new Set();
    state.selection.forEach(s => s.indices.forEach(i => unique.add(i)));
    unique.forEach(i => {
      pos.setXYZ(i, pos.getX(i)+dLocal.x, pos.getY(i)+dLocal.y, pos.getZ(i)+dLocal.z);
    });
    pos.needsUpdate = true;
    state.selection.forEach(s => s.centroidLocal.add(dLocal));
    obj.geometry.computeVertexNormals();
    refreshHelpers(obj);
  }

  function refreshHelpers(obj) {
    const pts = obj.userData.sub.vertexPoints;
    pts.geometry.attributes.position.array.set(obj.geometry.attributes.position.array);
    pts.geometry.attributes.position.needsUpdate = true;
  }

  return {
    togglePick, hasSelection: () => state.selection.length > 0,
    getSelectionWorldCenter, applySelectionWorldDelta,
    clearSelection: () => { state.selection = []; },
    applySubVisibility: (obj) => { /* activa puntos */ obj.userData.sub.vertexPoints.visible = true; },
    cancelToBaseline: () => { /* revierte array */ },
    commitSelectionDeltaAsAction: () => { return null; }
  };
}
