/* ============================================================
   Subcomponents module: Merged Vertices & Dynamic Selection
============================================================ */
export function setupSubcomponents(api) {
  const {
    THREE, CFG, scene, camera, renderer,
    raycaster, mouse, getSelectedObject
  } = api;

  const btnV = document.getElementById('sub-verts');
  const btnE = document.getElementById('sub-edges');
  const btnF = document.getElementById('sub-faces');

  let subModeVerts = false;
  let subModeEdges = false;
  let subModeFaces = false;
  let explodeMode = false; // Nueva bandera para separar vértices

  let activeSub = null; 

  function setSubFlagsFromUI() {
    subModeVerts = btnV.classList.contains('active');
    subModeEdges = btnE.classList.contains('active');
    subModeFaces = btnF.classList.contains('active');
    const obj = getSelectedObject();
    if (obj) applySubVisibility(obj);
  }

  // Lógica de "Merge": encuentra todos los índices en la misma posición
  function getMergedIndices(obj, primaryIndex) {
    if (explodeMode) return [primaryIndex];
    
    const pos = obj.geometry.attributes.position;
    const target = new THREE.Vector3().fromBufferAttribute(pos, primaryIndex);
    const indices = [];
    const threshold = 1e-4;

    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (v.distanceTo(target) < threshold) {
        indices.push(i);
      }
    }
    return indices;
  }

  function pickSubcomponent(raycaster, obj) {
    ensureSubHelpers(obj);

    if (subModeVerts && obj.userData.sub.vertexPoints) {
      const hits = raycaster.intersectObject(obj.userData.sub.vertexPoints, true);
      if (hits.length) {
        const idx = hits[0].index;
        const merged = getMergedIndices(obj, idx);
        highlightVertices(obj, merged);
        return { type: 'vertex', indices: merged, worldPos: hits[0].point.clone() };
      }
    }
    // ... (resto de lógica de edges/faces similar usando getMergedIndices si aplica)
    return null;
  }

  function highlightVertices(obj, indices) {
    const col = obj.userData.sub.vertexPoints.geometry.attributes.color;
    for (let i = 0; i < col.count; i++) col.setXYZ(i, 1, 1, 1);
    indices.forEach(idx => col.setXYZ(idx, 0.2, 1.0, 0.4));
    col.needsUpdate = true;
  }

  // El resto de funciones (applySubTranslateWorldDelta, etc.) se mantienen
  // pero usando la lista de indices 'merged'.

  return {
    setSubFlagsFromUI,
    pickSubcomponent,
    setActiveSub: (sub) => { activeSub = sub; if(sub) sub.accLocal = new THREE.Vector3(); },
    clearActiveSub: () => { activeSub = null; },
    hasActiveSub: () => !!activeSub,
    getActiveSubWorldPos: () => activeSub?.worldPos || null,
    applySubTranslateWorldDelta,
    commitSubEditIfAny,
    applySubVisibility,
    // Hook para cambiar modo explode desde el core
    setExplodeMode: (val) => { explodeMode = val; }
  };
}
