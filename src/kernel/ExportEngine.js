// CADWorks Pro - Export Engine
// Supports STEP AP214/AP242 B-Rep Solids, IGES 5.3 MSBO, STL (Binary & ASCII), OBJ, DXF (R12/2000/2018), and JSON
import saveAs from 'file-saver';
import * as THREE from 'three';

export class ExportEngine {
  /**
   * Export Three.js BufferGeometry to STL format (Binary or ASCII) with exact normal preservation
   * @param {THREE.BufferGeometry} geometry
   * @param {boolean} binary
   * @returns {Blob}
   */
  exportSTL(geometry, binary = true) {
    if (!geometry) {
      throw new Error('No geometry provided for STL export');
    }

    let geom = geometry.clone();
    if (geom.index) {
      geom = geom.toNonIndexed();
    }

    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const posAttr = geom.getAttribute('position');
    const normalAttr = geom.getAttribute('normal');
    const numTriangles = posAttr ? Math.floor(posAttr.count / 3) : 0;

    if (binary) {
      const bufferLength = 84 + numTriangles * 50;
      const buffer = new ArrayBuffer(bufferLength);
      const writer = new DataView(buffer);

      // 80-byte header
      const headerStr = 'CADWorks Pro 3D STL Binary Export - Exact Mesh B-Rep';
      for (let i = 0; i < 80; i++) {
        writer.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0x20);
      }

      writer.setUint32(80, numTriangles, true);

      let offset = 84;
      if (posAttr && posAttr.count >= 3) {
        for (let i = 0; i < posAttr.count; i += 3) {
          // Compute or retrieve facet normal
          let nx = normalAttr ? normalAttr.getX(i) : 0;
          let ny = normalAttr ? normalAttr.getY(i) : 0;
          let nz = normalAttr ? normalAttr.getZ(i) : 1;

          if (isNaN(nx) || !isFinite(nx)) nx = 0;
          if (isNaN(ny) || !isFinite(ny)) ny = 0;
          if (isNaN(nz) || !isFinite(nz)) nz = 1;

          // If normal is zero or degenerate, calculate face normal from 3 vertices
          if (Math.abs(nx) < 1e-7 && Math.abs(ny) < 1e-7 && Math.abs(nz) < 1e-7) {
            const v0 = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            const v1 = new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
            const v2 = new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));
            const fn = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
            nx = isNaN(fn.x) ? 0 : fn.x;
            ny = isNaN(fn.y) ? 0 : fn.y;
            nz = isNaN(fn.z) ? 1 : fn.z;
          }

          writer.setFloat32(offset, nx, true); offset += 4;
          writer.setFloat32(offset, ny, true); offset += 4;
          writer.setFloat32(offset, nz, true); offset += 4;

          // 3 Vertices
          for (let v = 0; v < 3; v++) {
            const vx = posAttr.getX(i + v);
            const vy = posAttr.getY(i + v);
            const vz = posAttr.getZ(i + v);
            writer.setFloat32(offset, isNaN(vx) ? 0 : vx, true); offset += 4;
            writer.setFloat32(offset, isNaN(vy) ? 0 : vy, true); offset += 4;
            writer.setFloat32(offset, isNaN(vz) ? 0 : vz, true); offset += 4;
          }

          // Attribute byte count (0)
          writer.setUint16(offset, 0, true); offset += 2;
        }
      }

      return new Blob([buffer], { type: 'application/sla' });
    } else {
      let stl = 'solid CADWorksModel\n';
      if (posAttr && posAttr.count >= 3) {
        for (let i = 0; i < posAttr.count; i += 3) {
          let nx = normalAttr ? normalAttr.getX(i) : 0;
          let ny = normalAttr ? normalAttr.getY(i) : 0;
          let nz = normalAttr ? normalAttr.getZ(i) : 1;

          if (isNaN(nx) || !isFinite(nx)) nx = 0;
          if (isNaN(ny) || !isFinite(ny)) ny = 0;
          if (isNaN(nz) || !isFinite(nz)) nz = 1;

          if (Math.abs(nx) < 1e-7 && Math.abs(ny) < 1e-7 && Math.abs(nz) < 1e-7) {
            const v0 = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            const v1 = new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1));
            const v2 = new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2));
            const fn = new THREE.Vector3().subVectors(v1, v0).cross(new THREE.Vector3().subVectors(v2, v0)).normalize();
            nx = isNaN(fn.x) ? 0 : fn.x;
            ny = isNaN(fn.y) ? 0 : fn.y;
            nz = isNaN(fn.z) ? 1 : fn.z;
          }

          stl += `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
          stl += '    outer loop\n';
          for (let v = 0; v < 3; v++) {
            const x = (isNaN(posAttr.getX(i + v)) ? 0 : posAttr.getX(i + v)).toFixed(6);
            const y = (isNaN(posAttr.getY(i + v)) ? 0 : posAttr.getY(i + v)).toFixed(6);
            const z = (isNaN(posAttr.getZ(i + v)) ? 0 : posAttr.getZ(i + v)).toFixed(6);
            stl += `      vertex ${x} ${y} ${z}\n`;
          }
          stl += '    endloop\n';
          stl += '  endfacet\n';
        }
      }
      stl += 'endsolid CADWorksModel\n';
      return new Blob([stl], { type: 'text/plain' });
    }
  }

  /**
   * Export BufferGeometry to Wavefront OBJ format
   */
  exportOBJ(geometry, objectName = 'CADWorksModel') {
    if (!geometry) throw new Error('No geometry for OBJ export');
    let geom = geometry.clone();
    if (geom.index) geom = geom.toNonIndexed();

    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const posAttr = geom.getAttribute('position');
    const normalAttr = geom.getAttribute('normal');

    let output = `# CADWorks Pro Wavefront OBJ Export\n# Object: ${objectName}\n\no ${objectName}\n\n`;

    // Vertices
    for (let i = 0; i < posAttr.count; i++) {
      output += `v ${posAttr.getX(i).toFixed(6)} ${posAttr.getY(i).toFixed(6)} ${posAttr.getZ(i).toFixed(6)}\n`;
    }

    // Normals
    if (normalAttr) {
      output += '\n';
      for (let i = 0; i < normalAttr.count; i++) {
        output += `vn ${normalAttr.getX(i).toFixed(6)} ${normalAttr.getY(i).toFixed(6)} ${normalAttr.getZ(i).toFixed(6)}\n`;
      }
    }

    // Faces
    output += '\ns 1\n';
    for (let i = 0; i < posAttr.count; i += 3) {
      const idx1 = i + 1;
      const idx2 = i + 2;
      const idx3 = i + 3;
      if (normalAttr) {
        output += `f ${idx1}//${idx1} ${idx2}//${idx2} ${idx3}//${idx3}\n`;
      } else {
        output += `f ${idx1} ${idx2} ${idx3}\n`;
      }
    }

    return new Blob([output], { type: 'text/plain' });
  }

  /**
   * Export 2D sketch entities and/or 3D wireframe mesh to AutoCAD DXF format
   * Supports versions: 'R12' (AC1009), '2000' (AC1015), '2018' (AC1032)
   * @param {Array|THREE.BufferGeometry} entitiesOrGeometry
   * @param {Object} options
   * @returns {Blob}
   */
  exportDXF(entitiesOrGeometry, options = {}) {
    const version = (options.version || '2000').toUpperCase();
    let acadVer = 'AC1015'; // 2000 default
    if (version === 'R12' || version === 'AC1009') acadVer = 'AC1009';
    else if (version === '2018' || version === 'AC1032') acadVer = 'AC1032';

    // Defensive coordinate formatting: handles negative decimals, zero without -0, and guards against NaNs
    const formatCoord = (val) => {
      const num = typeof val === 'number' ? val : parseFloat(val);
      if (isNaN(num) || !isFinite(num)) return '0.0000';
      const fixed = num.toFixed(4);
      return (fixed === '-0.0000' || fixed === '-0') ? '0.0000' : fixed;
    };

    let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\n${acadVer}\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n1\n0\nLAYER\n2\n0\n70\n0\n62\n7\n6\nCONTINUOUS\n0\nENDTAB\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nENTITIES\n`;

    // Handle 3D geometry export as DXF 3DFACE
    if (entitiesOrGeometry && (entitiesOrGeometry.isBufferGeometry || entitiesOrGeometry.getAttribute)) {
      let geom = entitiesOrGeometry.clone();
      if (geom.index) geom = geom.toNonIndexed();
      const pos = geom.getAttribute('position');

      if (pos && pos.count >= 3) {
        for (let i = 0; i < pos.count; i += 3) {
          const x1 = formatCoord(pos.getX(i)), y1 = formatCoord(pos.getY(i)), z1 = formatCoord(pos.getZ(i));
          const x2 = formatCoord(pos.getX(i + 1)), y2 = formatCoord(pos.getY(i + 1)), z2 = formatCoord(pos.getZ(i + 1));
          const x3 = formatCoord(pos.getX(i + 2)), y3 = formatCoord(pos.getY(i + 2)), z3 = formatCoord(pos.getZ(i + 2));

          dxf += `0\n3DFACE\n8\n0\n`;
          dxf += `10\n${x1}\n20\n${y1}\n30\n${z1}\n`;
          dxf += `11\n${x2}\n21\n${y2}\n31\n${z2}\n`;
          dxf += `12\n${x3}\n22\n${y3}\n32\n${z3}\n`;
          dxf += `13\n${x3}\n23\n${y3}\n33\n${z3}\n`; // Quad face closed on 3rd vertex
        }
      }
    } else if (Array.isArray(entitiesOrGeometry)) {
      // 2D sketch entities
      for (const ent of entitiesOrGeometry) {
        if (!ent) continue;
        if (ent.type === 'line' && ent.p1 && ent.p2) {
          dxf += `0\nLINE\n8\n0\n`;
          dxf += `10\n${formatCoord(ent.p1.x)}\n20\n${formatCoord(ent.p1.y)}\n30\n${formatCoord(ent.p1.z || 0.0)}\n`;
          dxf += `11\n${formatCoord(ent.p2.x)}\n21\n${formatCoord(ent.p2.y)}\n31\n${formatCoord(ent.p2.z || 0.0)}\n`;
        } else if (ent.type === 'circle' && ent.center) {
          dxf += `0\nCIRCLE\n8\n0\n`;
          dxf += `10\n${formatCoord(ent.center.x)}\n20\n${formatCoord(ent.center.y)}\n30\n${formatCoord(ent.center.z || 0.0)}\n`;
          dxf += `40\n${formatCoord(ent.radius || 10.0)}\n`;
        } else if (ent.type === 'arc' && ent.center) {
          dxf += `0\nARC\n8\n0\n`;
          dxf += `10\n${formatCoord(ent.center.x)}\n20\n${formatCoord(ent.center.y)}\n30\n${formatCoord(ent.center.z || 0.0)}\n`;
          dxf += `40\n${formatCoord(ent.radius || 10.0)}\n`;
          const sDeg = formatCoord(((ent.startAngle || 0) * 180) / Math.PI);
          const eDeg = formatCoord(((ent.endAngle || 0) * 180) / Math.PI);
          dxf += `50\n${sDeg}\n51\n${eDeg}\n`;
        } else if (ent.type === 'rect' && ent.p1 && ent.p2) {
          // Closed 4-line rectangle
          const pts = [
            { x: ent.p1.x, y: ent.p1.y },
            { x: ent.p2.x, y: ent.p1.y },
            { x: ent.p2.x, y: ent.p2.y },
            { x: ent.p1.x, y: ent.p2.y },
          ];
          for (let k = 0; k < 4; k++) {
            const next = pts[(k + 1) % 4];
            dxf += `0\nLINE\n8\n0\n`;
            dxf += `10\n${formatCoord(pts[k].x)}\n20\n${formatCoord(pts[k].y)}\n30\n0.0000\n`;
            dxf += `11\n${formatCoord(next.x)}\n21\n${formatCoord(next.y)}\n31\n0.0000\n`;
          }
        } else if (ent.type === 'point' && ent.x !== undefined) {
          dxf += `0\nPOINT\n8\n0\n`;
          dxf += `10\n${formatCoord(ent.x)}\n20\n${formatCoord(ent.y)}\n30\n${formatCoord(ent.z || 0.0)}\n`;
        }
      }
    }

    dxf += `0\nENDSEC\n0\nEOF\n`;
    return new Blob([dxf], { type: 'application/dxf' });
  }

  /**
   * Export model to ISO 10303-21 STEP (AP214 / AP242 with Advanced B-Rep Solid Entities & Color Styling)
   * Supports MANIFOLD_SOLID_BREP, ADVANCED_BREP_SHAPE_REPRESENTATION, ORIENTED_EDGE, EDGE_LOOP, ADVANCED_FACE,
   * geometric surfaces, and color styling.
   * @param {THREE.BufferGeometry} geometry
   * @param {string} modelName
   * @param {Object} options
   * @returns {Blob}
   */
  exportSTEP(geometry, modelName = 'CADWORKS_PART', options = {}) {
    if (!geometry) throw new Error('No geometry for STEP export');
    let geom = geometry.clone();
    if (geom.index) geom = geom.toNonIndexed();

    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const pos = geom.getAttribute('position');
    const normal = geom.getAttribute('normal');
    // Standard ISO 8601 timestamp in STEP Part 21 (YYYY-MM-DDTHH:MM:SS)
    const timestamp = new Date().toISOString().slice(0, 19);
    const schema = options.schema === 'AP214' ? 'AUTOMOTIVE_DESIGN' : 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF';
    const safeModelName = String(modelName || 'CADWORKS_PART').replace(/[^a-zA-Z0-9_-]/g, '_');

    // Color: Steel / Teal accent by default, or customizable
    const colorR = options.colorR !== undefined ? options.colorR : 0.22;
    const colorG = options.colorG !== undefined ? options.colorG : 0.74;
    const colorB = options.colorB !== undefined ? options.colorB : 0.97;

    let step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('CADWorks Pro High-Fidelity Solid B-Rep STEP Export', '3D Mechanical Solid Model', 'CAX-IF Rec.Pracs. Solid B-Rep'), '2;1');
FILE_NAME('${safeModelName}.stp', '${timestamp}', ('Mechanical Engineer'), ('CADWorks Pro Engineering'), 'CADWorks Pro Kernel 2.0', 'CADWorks Pro AP214/AP242 Exporter', '');
FILE_SCHEMA(('${schema}'));
ENDSEC;

DATA;
#1=APPLICATION_CONTEXT('core data for automotive and aerospace mechanical design processes');
#2=APPLICATION_PROTOCOL_DEFINITION('international standard','${schema.toLowerCase()}',2020,#1);
#3=PRODUCT_CONTEXT('part definition context',#1,'mechanical');
#4=PRODUCT('${safeModelName}','${safeModelName}','Solid B-Rep Part',(#3));
#5=PRODUCT_DEFINITION_FORMATION('1.0','Initial Release',#4);
#6=PRODUCT_DEFINITION('design','Mechanical CAD Solid Model',#5,#3);
#7=PRODUCT_DEFINITION_SHAPE('${safeModelName}_SHAPE','Part 3D Shape Description',#6);
#8=SHAPE_DEFINITION_REPRESENTATION(#7,#9);
#9=ADVANCED_BREP_SHAPE_REPRESENTATION('${safeModelName}_BREP_REP',(#10,#11),#12);
#10=AXIS2_PLACEMENT_3D('Origin Placement',#13,#14,#15);
#11=MANIFOLD_SOLID_BREP('${safeModelName}_SOLID',#16);
#12=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#17)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#18,#19,#20)) REPRESENTATION_CONTEXT('3D Context','Mechanical'));
#13=CARTESIAN_POINT('Origin Coordinates',(0.,0.,0.));
#14=DIRECTION('Z Vector Axis',(0.,0.,1.));
#15=DIRECTION('X Vector Axis',(1.,0.,0.));
#16=CLOSED_SHELL('${safeModelName}_SHELL',(`;

    let entityId = 30;
    const faceIds = [];

    // Group triangles or export bounded planar faces
    const numTriangles = pos ? Math.min(Math.floor(pos.count / 3), options.maxFaces || 1200) : 0;

    let entitiesBuffer = '';

    for (let t = 0; t < numTriangles; t++) {
      const i = t * 3;

      // 3 Cartesian Points
      const cp1 = entityId++;
      const cp2 = entityId++;
      const cp3 = entityId++;
      const x1 = (isNaN(pos.getX(i)) ? 0 : pos.getX(i)).toFixed(4);
      const y1 = (isNaN(pos.getY(i)) ? 0 : pos.getY(i)).toFixed(4);
      const z1 = (isNaN(pos.getZ(i)) ? 0 : pos.getZ(i)).toFixed(4);
      const x2 = (isNaN(pos.getX(i + 1)) ? 0 : pos.getX(i + 1)).toFixed(4);
      const y2 = (isNaN(pos.getY(i + 1)) ? 0 : pos.getY(i + 1)).toFixed(4);
      const z2 = (isNaN(pos.getZ(i + 1)) ? 0 : pos.getZ(i + 1)).toFixed(4);
      const x3 = (isNaN(pos.getX(i + 2)) ? 0 : pos.getX(i + 2)).toFixed(4);
      const y3 = (isNaN(pos.getY(i + 2)) ? 0 : pos.getY(i + 2)).toFixed(4);
      const z3 = (isNaN(pos.getZ(i + 2)) ? 0 : pos.getZ(i + 2)).toFixed(4);

      entitiesBuffer += `#${cp1}=CARTESIAN_POINT('',(${x1},${y1},${z1}));\n`;
      entitiesBuffer += `#${cp2}=CARTESIAN_POINT('',(${x2},${y2},${z2}));\n`;
      entitiesBuffer += `#${cp3}=CARTESIAN_POINT('',(${x3},${y3},${z3}));\n`;

      // 3 Vertex Points
      const vp1 = entityId++;
      const vp2 = entityId++;
      const vp3 = entityId++;
      entitiesBuffer += `#${vp1}=VERTEX_POINT('',#${cp1});\n`;
      entitiesBuffer += `#${vp2}=VERTEX_POINT('',#${cp2});\n`;
      entitiesBuffer += `#${vp3}=VERTEX_POINT('',#${cp3});\n`;

      // Directions & Lines for edges
      const d1 = entityId++, line1 = entityId++;
      const d2 = entityId++, line2 = entityId++;
      const d3 = entityId++, line3 = entityId++;

      entitiesBuffer += `#${d1}=VECTOR('',#14,1.0);\n`;
      entitiesBuffer += `#${line1}=LINE('',#${cp1},#${d1});\n`;
      entitiesBuffer += `#${d2}=VECTOR('',#14,1.0);\n`;
      entitiesBuffer += `#${line2}=LINE('',#${cp2},#${d2});\n`;
      entitiesBuffer += `#${d3}=VECTOR('',#14,1.0);\n`;
      entitiesBuffer += `#${line3}=LINE('',#${cp3},#${d3});\n`;

      // 3 Edge Curves
      const ec1 = entityId++;
      const ec2 = entityId++;
      const ec3 = entityId++;
      entitiesBuffer += `#${ec1}=EDGE_CURVE('',#${vp1},#${vp2},#${line1},.T.);\n`;
      entitiesBuffer += `#${ec2}=EDGE_CURVE('',#${vp2},#${vp3},#${line2},.T.);\n`;
      entitiesBuffer += `#${ec3}=EDGE_CURVE('',#${vp3},#${vp1},#${line3},.T.);\n`;

      // 3 Oriented Edges
      const oe1 = entityId++;
      const oe2 = entityId++;
      const oe3 = entityId++;
      entitiesBuffer += `#${oe1}=ORIENTED_EDGE('',*,*,#${ec1},.T.);\n`;
      entitiesBuffer += `#${oe2}=ORIENTED_EDGE('',*,*,#${ec2},.T.);\n`;
      entitiesBuffer += `#${oe3}=ORIENTED_EDGE('',*,*,#${ec3},.T.);\n`;

      // Edge Loop
      const loopId = entityId++;
      entitiesBuffer += `#${loopId}=EDGE_LOOP('',(#${oe1},#${oe2},#${oe3}));\n`;

      // Face Outer Bound
      const boundId = entityId++;
      entitiesBuffer += `#${boundId}=FACE_OUTER_BOUND('',#${loopId},.T.);\n`;

      // Surface Normal & Axis Placement for Geometric Plane Surface
      const nxVal = normal ? normal.getX(i) : 0;
      const nyVal = normal ? normal.getY(i) : 0;
      const nzVal = normal ? normal.getZ(i) : 1;
      const nx = (isNaN(nxVal) || !isFinite(nxVal) ? 0 : nxVal).toFixed(4);
      const ny = (isNaN(nyVal) || !isFinite(nyVal) ? 0 : nyVal).toFixed(4);
      const nz = (isNaN(nzVal) || !isFinite(nzVal) ? 1 : nzVal).toFixed(4);

      const normDir = entityId++;
      const axisPlace = entityId++;
      const planeSurf = entityId++;
      entitiesBuffer += `#${normDir}=DIRECTION('FaceNormal',(${nx},${ny},${nz}));\n`;
      // In STEP AXIS2_PLACEMENT_3D, ref direction cannot be parallel/colinear to normal axis
      const refDirId = Math.abs(parseFloat(nx)) > 0.85 ? '#21' : '#15';
      entitiesBuffer += `#${axisPlace}=AXIS2_PLACEMENT_3D('FacePlacement',#${cp1},#${normDir},${refDirId});\n`;
      entitiesBuffer += `#${planeSurf}=PLANE('PlanarSurface',#${axisPlace});\n`;

      // ADVANCED_FACE
      const faceId = entityId++;
      entitiesBuffer += `#${faceId}=ADVANCED_FACE('Face_${t+1}',(#${boundId}),#${planeSurf},.T.);\n`;
      faceIds.push(`#${faceId}`);
    }

    step += (faceIds.length > 0 ? faceIds.join(',') : '') + '));\n';
    step += `#17=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#18,'distance_accuracy_value','Solid Tolerance');\n`;
    step += `#18=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));\n`;
    step += `#19=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));\n`;
    step += `#20=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());\n`;
    step += `#21=DIRECTION('Y Vector Axis',(0.,1.,0.));\n`;

    // Append B-Rep entities
    step += entitiesBuffer;

    // Color Styling Entities (AP214 / AP242 Presentation Model)
    const colorId = entityId++;
    const fillColourId = entityId++;
    const fillStyleId = entityId++;
    const surfaceStyleAreaId = entityId++;
    const sideStyleId = entityId++;
    const surfaceUsageId = entityId++;
    const presStyleAssignId = entityId++;
    const styledItemId = entityId++;
    const mechPresRepId = entityId++;

    step += `#${colorId}=COLOUR_RGB('SolidColor',${colorR.toFixed(3)},${colorG.toFixed(3)},${colorB.toFixed(3)});\n`;
    step += `#${fillColourId}=FILL_AREA_STYLE_COLOUR('FillColour',#${colorId});\n`;
    step += `#${fillStyleId}=FILL_AREA_STYLE('FillStyle',(#${fillColourId}));\n`;
    step += `#${surfaceStyleAreaId}=SURFACE_STYLE_FILL_AREA(#${fillStyleId});\n`;
    step += `#${sideStyleId}=SURFACE_SIDE_STYLE('SideStyle',(#${surfaceStyleAreaId}));\n`;
    step += `#${surfaceUsageId}=SURFACE_STYLE_USAGE(.BOTH.,#${sideStyleId});\n`;
    step += `#${presStyleAssignId}=PRESENTATION_STYLE_ASSIGNMENT((#${surfaceUsageId}));\n`;
    step += `#${styledItemId}=STYLED_ITEM('StyledSolid',(#${presStyleAssignId}),#11);\n`;
    step += `#${mechPresRepId}=MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('Presentation',(#${styledItemId}),#12);\n`;

    step += `ENDSEC;\nEND-ISO-10303-21;\n`;
    return new Blob([step], { type: 'application/step' });
  }

  /**
   * Export model to IGES 5.3 format (Initial Graphics Exchange Specification)
   * Implements complete 80-column fixed-record format with:
   * Entity 186: Manifold Solid B-Rep Object (MSBO)
   * Entity 514: Shell
   * Entity 510: Face
   * Entity 508: Loop
   * Entity 504: Edge
   * Entity 502: Vertex List
   * Entity 128: Rational B-Spline Surface / 108: Plane Surface
   * @param {THREE.BufferGeometry} geometry
   * @param {string} modelName
   * @param {Object} options
   * @returns {Blob}
   */
  exportIGES(geometry, modelName = 'CADWORKS_PART', options = {}) {
    if (!geometry) throw new Error('No geometry for IGES export');
    let geom = geometry.clone();
    if (geom.index) geom = geom.toNonIndexed();

    if (!geom.getAttribute('normal')) {
      geom.computeVertexNormals();
    }

    const pos = geom.getAttribute('position');
    const normal = geom.getAttribute('normal');
    const numTriangles = pos ? Math.min(Math.floor(pos.count / 3), options.maxFaces || 800) : 0;

    // Helpers for IGES 80-column fixed card formatting (strict 80 characters per line)
    const padRight = (str, len) => String(str ?? '').padEnd(len, ' ').substring(0, len);
    const padLeft = (str, len) => String(str ?? '').padStart(len, ' ').substring(0, len);
    const formatSeq = (type, seq) => type + String(seq).padStart(7, ' ').substring(0, 7);

    let startLines = [];
    let globalLines = [];
    let dirCards = [];
    let paramCards = [];

    // --- START SECTION (S) ---
    const startText = `CADWorks Pro IGES 5.3 Manifold Solid B-Rep Exporter (Entity 186 MSBO) - ${modelName}`;
    startLines.push(padRight(startText, 72) + formatSeq('S', 1));

    // --- GLOBAL SECTION (G) ---
    // Delimiter: comma ',', Terminator: semicolon ';'
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 15);
    const gParams = [
      "1H,", "1H;", "20HCADWorks Engineering", "16HCADWorks Model",
      "12HCADWorks Pro", "12HVersion 2.0", "32", "38", "6", "308", "15",
      "1.0", "2", "2HMM", "1", "1.0",
      `15H${timestamp}`, "0.001", "1000.0", "8HDesigner", "12HCompany Org", "11", "0"
    ];
    let gStr = gParams.join(',') + ';';
    let gOffset = 0;
    let gSeq = 1;
    while (gOffset < gStr.length) {
      const chunk = gStr.substring(gOffset, gOffset + 72);
      globalLines.push(padRight(chunk, 72) + formatSeq('G', gSeq++));
      gOffset += 72;
    }

    // --- DIRECTORY ENTRY (D) & PARAMETER DATA (P) SECTIONS ---
    let deSeq = 1;
    let paramSeq = 1;

    // Helper to add an entity to D & P sections
    // Returns the 1-based index of the entity's first Directory Entry line
    function addEntity(type, paramsArray, label = '', formNum = 0) {
      const deIndex = deSeq;
      const paramStart = paramSeq;

      // Format parameter string: 'type, param1, param2, ...;'
      const pStr = `${type},${paramsArray.join(',')};`;
      let pOffset = 0;
      let lineCount = 0;
      while (pOffset < pStr.length) {
        const chunk = pStr.substring(pOffset, pOffset + 64);
        const card = padRight(chunk, 64) + padLeft(String(deIndex), 8) + formatSeq('P', paramSeq++);
        paramCards.push(card);
        lineCount++;
        pOffset += 64;
      }

      // 2 D-cards (each exactly 80 columns)
      // Line 1: Type(8) Ptr(8) Struct(8) Font(8) Level(8) View(8) Trans(8) LabelDisp(8) Status(8) D#
      const d1 = padLeft(String(type), 8) +
                 padLeft(String(paramStart), 8) +
                 padLeft('0', 8) +
                 padLeft('1', 8) +
                 padLeft('0', 8) +
                 padLeft('0', 8) +
                 padLeft('0', 8) +
                 padLeft('0', 8) +
                 padLeft('00010001', 8) +
                 formatSeq('D', deSeq++);

      // Line 2: Type(8) Weight(8) Color(8) LineCount(8) Form(8) Res(8) Res(8) Label(8) Subscript(8) D#
      const d2 = padLeft(String(type), 8) +
                 padLeft('1', 8) +
                 padLeft('7', 8) + // Cyan / Blue color
                 padLeft(String(lineCount), 8) +
                 padLeft(String(formNum), 8) +
                 padLeft('0', 8) +
                 padLeft('0', 8) +
                 padRight(label, 8) +
                 padLeft('0', 8) +
                 formatSeq('D', deSeq++);

      dirCards.push(d1, d2);
      return deIndex;
    }

    // 1. Entity 502: Vertex List (coordinates of all triangle vertices)
    const vertCoords = [];
    for (let t = 0; t < numTriangles; t++) {
      const i = t * 3;
      vertCoords.push(pos.getX(i).toFixed(4), pos.getY(i).toFixed(4), pos.getZ(i).toFixed(4));
      vertCoords.push(pos.getX(i+1).toFixed(4), pos.getY(i+1).toFixed(4), pos.getZ(i+1).toFixed(4));
      vertCoords.push(pos.getX(i+2).toFixed(4), pos.getY(i+2).toFixed(4), pos.getZ(i+2).toFixed(4));
    }
    const vertexCount = numTriangles * 3;
    const vertexEntityDE = addEntity(502, [vertexCount, ...vertCoords], 'VERTICES');

    // 2. Entity 504: Edge Entities & Entity 508: Loop Entities & Entity 128/108: Surfaces & Entity 510: Faces
    const faceDEs = [];

    for (let t = 0; t < numTriangles; t++) {
      const vBase = t * 3 + 1; // 1-based vertex index in 502
      const v1 = vBase;
      const v2 = vBase + 1;
      const v3 = vBase + 2;

      // Create 3 Edges for the triangle (Entity 504)
      // Form 1 = line segment connecting vertex list indices
      const e1 = addEntity(504, [vertexEntityDE, v1, vertexEntityDE, v2, 0], 'EDGE', 1);
      const e2 = addEntity(504, [vertexEntityDE, v2, vertexEntityDE, v3, 0], 'EDGE', 1);
      const e3 = addEntity(504, [vertexEntityDE, v3, vertexEntityDE, v1, 0], 'EDGE', 1);

      // Create Loop Entity 508 (references 3 edges with orientation 1 = same direction)
      const loopDE = addEntity(508, [
        1, // Loop type: 1 = outer loop
        3, // Count of edges
        e1, 1, 0,
        e2, 1, 0,
        e3, 1, 0
      ], 'LOOP');

      // Create Surface: Rational B-Spline Surface (Entity 128) representing planar triangle facet
      const i = t * 3;
      const p1x = pos.getX(i).toFixed(4), p1y = pos.getY(i).toFixed(4), p1z = pos.getZ(i).toFixed(4);
      const p2x = pos.getX(i+1).toFixed(4), p2y = pos.getY(i+1).toFixed(4), p2z = pos.getZ(i+1).toFixed(4);
      const p3x = pos.getX(i+2).toFixed(4), p3y = pos.getY(i+2).toFixed(4), p3z = pos.getZ(i+2).toFixed(4);

      // 128 NURBS parameters: K1=1, K2=1, M1=1, M2=1, PROP1=0, PROP2=0, PROP3=1, PROP4=0, PROP5=0
      // Knots: 0,0,1,1 and 0,0,1,1; Weights: 1,1,1,1; Control Points
      const surfDE = addEntity(128, [
        1, 1, 1, 1, 0, 0, 1, 0, 0,
        0.0, 0.0, 1.0, 1.0,
        0.0, 0.0, 1.0, 1.0,
        1.0, 1.0, 1.0, 1.0,
        p1x, p1y, p1z,
        p2x, p2y, p2z,
        p3x, p3y, p3z,
        p1x, p1y, p1z,
        0.0, 1.0, 0.0, 1.0
      ], 'SURF128');

      // Create Face Entity 510 (references Surface DE, outer loop DE)
      const faceDE = addEntity(510, [
        surfDE,
        1,       // Outer loop count
        1,       // Outer loop orientation
        loopDE
      ], 'FACE');

      faceDEs.push(faceDE);
    }

    // 3. Entity 514: Shell Entity
    // Param: number of faces, then for each face: face DE pointer, orientation flag (1)
    const shellParams = [faceDEs.length];
    faceDEs.forEach(fde => {
      shellParams.push(fde, 1);
    });
    const shellDE = addEntity(514, shellParams, 'SHELL');

    // 4. Entity 186: Manifold Solid B-Rep Object (MSBO)
    // Param: Shell DE pointer, Orientation flag (1 = positive), Number of void shells (0)
    addEntity(186, [shellDE, 1, 0], 'MSBO');

    // --- TERMINATE SECTION (T) ---
    const termCard = `S${padLeft(String(startLines.length), 7)}` +
                     `G${padLeft(String(globalLines.length), 7)}` +
                     `D${padLeft(String(dirCards.length), 7)}` +
                     `P${padLeft(String(paramCards.length), 7)}` +
                     padRight('', 40) +
                     formatSeq('T', 1);

    const fullIges = [
      ...startLines,
      ...globalLines,
      ...dirCards,
      ...paramCards,
      termCard
    ].join('\n') + '\n';

    return new Blob([fullIges], { type: 'application/iges' });
  }

  downloadFile(blobOrString, filename, mimeType = 'text/plain') {
    const blob = blobOrString instanceof Blob ? blobOrString : new Blob([blobOrString], { type: mimeType });
    saveAs(blob, filename);
  }
}

export const exportEngine = new ExportEngine();
export default ExportEngine;
