/* editor-subcomponents.js */
export function setupSubcomponents(api) {
  const {
    THREE, CFG, scene, camera, renderer,
    raycaster, mouse,
    getSelectedObject,
    isMobile
  } = api;

  // Read UI toggles from DOM each click
  const btnV = document.getElementById('sub-verts');
  const btnE = document.getElementById('sub-edges');
  const btnF = document.getElementById('sub-faces');

  let subModeVerts = false;
  let subModeEdges = false;
  let subModeFaces = false;

  let activeSub = null;
  // { type:'vertex'|'edge'|'face', indices:[...], worldPos:Vector3, accLocal?:Vector3 }

  function setSubFlagsFromUI() {
    subModeVerts = btnV && btnV.classList.contains('active');
    subModeEdges = btnE && btnE.classList.contains('active');
    subModeFaces = btnF && btnF.classList.contains('active');

    const obj = getSelectedObject();
    if (obj) applySubVisibility(obj);
  }

  function ensureSubHelpers(obj) {
    if (!obj || !obj.geometry) return;
    if (!obj.userData.sub) obj.userData.sub = {};

    // Vert points
    if (!obj.userData.sub.vertexPoints) {
      const geom = obj.geometry;
      const posAttr = geom.attributes.position;

      const ptsGeo = new THREE.BufferGeometry();
      ptsGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(posAttr.array), 3));

      const col = new Float32Array(posAttr.count * 3);
      for (let i = 0; i < posAttr.count; i++) {
        col[i*3+0] = 1; col[i*3+1] = 1; col[i*3+2] = 1;
      }
      ptsGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));

      const ptsMat = new THREE.PointsMaterial({
        size: 0.10,
        vertexColors: true,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });

      const pts = new THREE.Points(ptsGeo, ptsMat);
      pts.renderOrder = 998;
      pts.visible = false;
      pts.name = 'VertexPoints';
      obj.add(pts);
      obj.userData.sub.vertexPoints = pts;
    }

    // Edges helper
    if (!obj.userData.sub.edgeLines) {
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(obj.geometry),
        new THREE.LineBasicMaterial({ color: CFG.subColorB, transparent: true, opacity: 0.55, depthTest: false })
      );
      edges.visible = false;
      edges.renderOrder = 997;
      edges.name = 'EdgeLines';
      obj.add(edges);
      obj.userData.sub.edgeLines = edges;
    }

    // Face wire helper
    if (!obj.userData.sub.faceWire) {
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(obj.geometry),
        new THREE.LineBasicMaterial({ color: CFG.subColorB, transparent: true, opacity: 0.35, depthTest: false })
      );
      wire.visible = false;
      wire.renderOrder = 996;
      wire.name = 'FaceWire';
      obj.add(wire);
      obj.userData.sub.faceWire = wire;
    }
  }

  function refreshSubMeshes(obj) {
    if (!obj?.userData?.sub) return;

    // update points positions
    const pts = obj.userData.sub.vertexPoints;
    if (pts) {
      const src = obj.geometry.attributes.position.array;
      const dst = pts.geometry.attributes.position;
      dst.array.set(src);
      dst.needsUpdate = true;
    }

    // rebuild edges and wire
    if (obj.userData.sub.edgeLines) {
      obj.remove(obj.userData.sub.edgeLines);
      obj.userData.sub.edgeLines.geometry.dispose();
      obj.userData.sub.edgeLines.material.dispose();
      obj.userData.sub.edgeLines = null;
    }
    if (obj.userData.sub.faceWire) {
      obj.remove(obj.userData.sub.faceWire);
      obj.userData.sub.faceWire.geometry.dispose();
      obj.userData.sub.faceWire.material.dispose();
      obj.userData.sub.faceWire = null;
    }

    ensureSubHelpers(obj);
    applySubVisibility(obj);
  }

  function applySubVisibility(obj) {
    ensureSubHelpers(obj);
    const show = (getSelectedObject() === obj);

    if(obj.userData.sub.vertexPoints) obj.userData.sub.vertexPoints.visible = show && subModeVerts;
    if(obj.userData.sub.edgeLines) obj.userData.sub.edgeLines.visible = show && subModeEdges;
    if(obj.userData.sub.faceWire) obj.userData.sub.faceWire.visible = show && subModeFaces;
  }

  function clearActiveSub() {
    activeSub = null;
  }
  function hasActiveSub() { return !!activeSub; }
  function getActiveSubWorldPos() {
    return activeSub?.worldPos || null;
  }
  function setActiveSub(sub) {
    activeSub = sub;
    if (!activeSub) return;
    activeSub.accLocal = new THREE.Vector3();
  }

  // Highlight helpers
  function highlightVertex(obj, idx) {
    ensureSubHelpers(obj);
    const pts = obj.userData.sub.vertexPoints;
    const col = pts.geometry.attributes.color;
    for (let i=0; i<col.count; i++) col.setXYZ(i, 1,1,1);
    col.setXYZ(idx, 0.2, 1.0, 0.4); // greenish
    col.needsUpdate = true;
  }
  function highlightEdge(obj) {
    ensureSubHelpers(obj);
    obj.userData.sub.edgeLines.material.opacity = 0.9;
    obj.userData.sub.edgeLines.material.color.setHex(CFG.subColorA);
  }
  function highlightFace(obj) {
    ensureSubHelpers(obj);
    obj.userData.sub.faceWire.material.opacity = 0.75;
    obj.userData.sub.faceWire.material.color.setHex(CFG.subColorA);
  }

  // Approx edge by nearest two vertices (simple but works)
  function approximateEdgeByNearest(obj, worldPoint) {
    const geom = obj.geometry;
    const pos = geom.attributes.position;
    const local = obj.worldToLocal(worldPoint.clone());

    let best = -1, bestD = Infinity;
    for (let i=0; i<pos.count; i++){
      const dx = pos.getX(i) - local.x;
      const dy = pos.getY(i) - local.y;
      const dz = pos.getZ(i) - local.z;
      const d = dx*dx + dy*dy + dz*dz;
      if (d < bestD){ bestD = d; best = i; }
    }
    if (best < 0) return null;

    let best2 = -1, bestD2 = Infinity;
    for (let i=0; i<pos.count; i++){
      if (i === best) continue;
      const dx = pos.getX(i) - local.x;
      const dy = pos.getY(i) - local.y;
      const dz = pos.getZ(i) - local.z;
      const d = dx*dx + dy*dy + dz*dz;
      if (d < bestD2){ bestD2 = d; best2 = i; }
    }
    if (best2 < 0) return null;
    return [best, best2];
  }

  function getSubCentroidLocal(obj, indices) {
    const pos = obj.geometry.attributes.position;
    const c = new THREE.Vector3();
    for (const i of indices){
      c.x += pos.getX(i);
      c.y += pos.getY(i);
      c.z += pos.getZ(i);
    }
    c.multiplyScalar(1 / Math.max(1, indices.length));
    return c;
  }

  // Apply local delta to indices
  function applyVertexDeltaLocal(obj, indices, dLocal) {
    const geom = obj.geometry;
    const pos = geom.attributes.position;
    for (const i of indices) {
      pos.setXYZ(i,
        pos.getX(i) + dLocal.x,
        pos.getY(i) + dLocal.y,
        pos.getZ(i) + dLocal.z
      );
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
  }

  // Used by undo/redo actions
  function applyVertexEditForward(action) {
    const mesh = findObjectById(action.id);
    if (!mesh) return;

    applyVertexDeltaLocal(mesh, action.indices, new THREE.Vector3(action.delta.x, action.delta.y, action.delta.z));
    refreshSubMeshes(mesh);
  }
  function applyVertexEditInverse(action) {
    const mesh = findObjectById(action.id);
    if (!mesh) return;

    applyVertexDeltaLocal(mesh, action.indices, new THREE.Vector3(-action.delta.x, -action.delta.y, -action.delta.z));
    refreshSubMeshes(mesh);
  }
  function findObjectById(id) {
    let found = null;
    scene.traverse(o => {
      if (o?.userData?.id === id) found = o;
    });
    return found;
  }

  // Picking (called by core on double tap)
  function pickSubcomponent(raycaster, obj) {
    ensureSubHelpers(obj);

    // VERTEX pick
    if (subModeVerts && obj.userData.sub.vertexPoints) {
      const hits = raycaster.intersectObject(obj.userData.sub.vertexPoints, true);
      if (hits.length) {
        const hit = hits[0];
        const idx = hit.index;
        const world = hit.point.clone();
        highlightVertex(obj, idx);
        return { type: 'vertex', indices: [idx], worldPos: world };
      }
    }

    // EDGE pick
    if (subModeEdges && obj.userData.sub.edgeLines) {
      const hits = raycaster.intersectObject(obj.userData.sub.edgeLines, true);
      if (hits.length) {
        const p = hits[0].point.clone();
        const pair = approximateEdgeByNearest(obj, p);
        if (pair) {
          highlightEdge(obj);
          return { type: 'edge', indices: pair, worldPos: p };
        }
      }
    }

    // FACE pick (raycast mesh)
    if (subModeFaces) {
      const hits = raycaster.intersectObject(obj, false);
      if (hits.length) {
        const h = hits[0];
        const face = h.face;
        const tri = [face.a, face.b, face.c];
        highlightFace(obj);
        return { type: 'face', indices: tri, worldPos: h.point.clone() };
      }
    }

    return null;
  }

  // Called by core during plane drag
  function applySubTranslateWorldDelta(obj, worldDelta) {
    if (!activeSub) return 0;

    // exact world->local delta:
    const p0 = obj.worldToLocal(obj.position.clone());
    const p1 = obj.worldToLocal(obj.position.clone().add(worldDelta));
    const dLocal = p1.sub(p0);

    applyVertexDeltaLocal(obj, activeSub.indices, dLocal);
    refreshSubMeshes(obj);

    // accumulate for commit (undo/redo)
    activeSub.accLocal.add(dLocal);

    // update activeSub worldPos to new centroid
    const newWorld = obj.localToWorld(getSubCentroidLocal(obj, activeSub.indices));
    const movedDistance = newWorld.distanceTo(activeSub.worldPos);
    activeSub.worldPos.copy(newWorld);

    return movedDistance;
  }

  // Commit as an undoable action
  function commitSubEditIfAny(pushActionFn) {
    if (!activeSub || !activeSub.accLocal) return;

    const d = activeSub.accLocal.clone();
    if (d.lengthSq() < 1e-10) return;

    const obj = getSelectedObject();
    if (!obj) return;

    pushActionFn({
      type: 'vertexEdit',
      id: obj.userData.id,
      indices: activeSub.indices.slice(),
      delta: { x: d.x, y: d.y, z: d.z }
    });

    // reset accumulator
    activeSub.accLocal.set(0, 0, 0);
  }

  // Public API for core
  return {
    setSubFlagsFromUI,
    ensureSubHelpers,
    refreshSubMeshes,
    applySubVisibility,
    pickSubcomponent,
    setActiveSub,
    clearActiveSub,
    hasActiveSub,
    getActiveSubWorldPos,
    applySubTranslateWorldDelta,
    commitSubEditIfAny,
    applyVertexEditForward,
    applyVertexEditInverse
  };
}
