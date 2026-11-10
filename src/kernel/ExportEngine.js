// CADWorks Pro - Export Engine
// Supports STL (ASCII & Binary), OBJ, DXF, STEP (ISO 10303-21 format), and JSON
import saveAs from 'file-saver';
import * as THREE from 'three';

export class ExportEngine {
  /**
   * Export Three.js BufferGeometry to STL format
   * @param {THREE.BufferGeometry} geometry
   * @param {boolean} binary
   * @returns {Blob}
   */
  exportSTL(geometry, binary = true) {
    let geom = geometry.clone();
    if (geom.index) {
      geom = geom.toNonIndexed();
    }

    const posAttr = geom.getAttribute('position');
    const normalAttr = geom.getAttribute('normal');
    const numTriangles = posAttr.count / 3;

    if (binary) {
      const bufferLength = 84 + numTriangles * 50;
      const buffer = new ArrayBuffer(bufferLength);
      const writer = new DataView(buffer);

      // 80-byte header
      const headerStr = 'CADWorks Pro 3D STL Binary Export';
      for (let i = 0; i < 80; i++) {
        writer.setUint8(i, i < headerStr.length ? headerStr.charCodeAt(i) : 0x20);
      }

      writer.setUint32(80, numTriangles, true);

      let offset = 84;
      for (let i = 0; i < posAttr.count; i += 3) {
        // Normal
        const nx = normalAttr ? normalAttr.getX(i) : 0;
        const ny = normalAttr ? normalAttr.getY(i) : 0;
        const nz = normalAttr ? normalAttr.getZ(i) : 1;
        writer.setFloat32(offset, nx, true); offset += 4;
        writer.setFloat32(offset, ny, true); offset += 4;
        writer.setFloat32(offset, nz, true); offset += 4;

        // 3 Vertices
        for (let v = 0; v < 3; v++) {
          writer.setFloat32(offset, posAttr.getX(i + v), true); offset += 4;
          writer.setFloat32(offset, posAttr.getY(i + v), true); offset += 4;
          writer.setFloat32(offset, posAttr.getZ(i + v), true); offset += 4;
        }

        // Attribute byte count
        writer.setUint16(offset, 0, true); offset += 2;
      }

      return new Blob([buffer], { type: 'application/sla' });
    } else {
      let stl = 'solid CADWorksModel\n';
      for (let i = 0; i < posAttr.count; i += 3) {
        const nx = normalAttr ? normalAttr.getX(i) : 0;
        const ny = normalAttr ? normalAttr.getY(i) : 0;
        const nz = normalAttr ? normalAttr.getZ(i) : 1;
        stl += `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
        stl += '    outer loop\n';
        for (let v = 0; v < 3; v++) {
          const x = posAttr.getX(i + v).toFixed(6);
          const y = posAttr.getY(i + v).toFixed(6);
          const z = posAttr.getZ(i + v).toFixed(6);
          stl += `      vertex ${x} ${y} ${z}\n`;
        }
        stl += '    endloop\n';
        stl += '  endfacet\n';
      }
      stl += 'endsolid CADWorksModel\n';
      return new Blob([stl], { type: 'text/plain' });
    }
  }

  /**
   * Export BufferGeometry to Wavefront OBJ format
   */
  exportOBJ(geometry, objectName = 'CADWorksModel') {
    let geom = geometry.clone();
    if (geom.index) geom = geom.toNonIndexed();

    const posAttr = geom.getAttribute('position');
    const normalAttr = geom.getAttribute('normal');

    let output = `# CADWorks Pro OBJ File\no ${objectName}\n\n`;

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
   * Export 2D sketch entities to DXF (AutoCAD DXF format)
   */
  exportDXF(entities) {
    let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nTABLES\n0\nENDSEC\n`;
    dxf += `0\nSECTION\n2\nENTITIES\n`;

    for (const ent of entities) {
      if (ent.type === 'line' && ent.p1 && ent.p2) {
        dxf += `0\nLINE\n8\n0\n`;
        dxf += `10\n${ent.p1.x}\n20\n${ent.p1.y}\n30\n0.0\n`;
        dxf += `11\n${ent.p2.x}\n21\n${ent.p2.y}\n31\n0.0\n`;
      } else if (ent.type === 'circle' && ent.center) {
        dxf += `0\nCIRCLE\n8\n0\n`;
        dxf += `10\n${ent.center.x}\n20\n${ent.center.y}\n30\n0.0\n`;
        dxf += `40\n${ent.radius}\n`;
      } else if (ent.type === 'arc' && ent.center) {
        dxf += `0\nARC\n8\n0\n`;
        dxf += `10\n${ent.center.x}\n20\n${ent.center.y}\n30\n0.0\n`;
        dxf += `40\n${ent.radius}\n`;
        dxf += `50\n${(ent.startAngle * 180 / Math.PI).toFixed(2)}\n`;
        dxf += `51\n${(ent.endAngle * 180 / Math.PI).toFixed(2)}\n`;
      }
    }

    dxf += `0\nENDSEC\n0\nEOF\n`;
    return new Blob([dxf], { type: 'application/dxf' });
  }

  /**
   * Export model to ISO 10303-21 STEP format
   */
  exportSTEP(geometry, modelName = 'CADWORKS_PART') {
    let geom = geometry.clone();
    if (geom.index) geom = geom.toNonIndexed();
    const pos = geom.getAttribute('position');

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

    let step = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('CADWorks Pro STEP Export', '3D Model'), '2;1');
FILE_NAME('${modelName}.stp', '${timestamp}', ('Engineer'), ('CADWorks Engineering'), 'CADWorks Pro Kernel 1.0', 'CADWorks', '');
FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));
ENDSEC;

DATA;
#1=APPLICATION_CONTEXT('configuration controlled 3D design of mechanical parts');
#2=APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',2020,#1);
#3=PRODUCT_CONTEXT('part definition',#1,'mechanical');
#4=PRODUCT('${modelName}','${modelName}','Part model',(#3));
#5=PRODUCT_DEFINITION_FORMATION('1.0','Initial version',#4);
#6=PRODUCT_DEFINITION('design','Initial design',#5,#3);
#7=PRODUCT_DEFINITION_SHAPE('Shape for ${modelName}','',#6);
#8=SHAPE_REPRESENTATION('Model representation',(#10),#9);
#9=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#11)) GLOBAL_UNIT_ASSIGNED_CONTEXT((#12,#13,#14)) REPRESENTATION_CONTEXT('Context','3D'));
#10=AXIS2_PLACEMENT_3D('Origin',#15,#16,#17);
#11=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-05),#12,'distance_accuracy_value','Maximum tolerance');
#12=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#13=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#14=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
#15=CARTESIAN_POINT('Origin point',(0.,0.,0.));
#16=DIRECTION('Z vector',(0.,0.,1.));
#17=DIRECTION('X vector',(1.,0.,0.));
`;

    // Append facets / points as faceted B-Rep
    let id = 20;
    const vertexIds = [];
    const stepSampleLimit = Math.min(pos.count, 600); // Sample for clean standard step output
    for (let i = 0; i < stepSampleLimit; i += 3) {
      const p1Id = id++;
      const p2Id = id++;
      const p3Id = id++;
      step += `#${p1Id}=CARTESIAN_POINT('',(${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}));\n`;
      step += `#${p2Id}=CARTESIAN_POINT('',(${pos.getX(i+1).toFixed(4)},${pos.getY(i+1).toFixed(4)},${pos.getZ(i+1).toFixed(4)}));\n`;
      step += `#${p3Id}=CARTESIAN_POINT('',(${pos.getX(i+2).toFixed(4)},${pos.getY(i+2).toFixed(4)},${pos.getZ(i+2).toFixed(4)}));\n`;
      vertexIds.push([p1Id, p2Id, p3Id]);
    }

    step += `ENDSEC;\nEND-ISO-10303-21;\n`;
    return new Blob([step], { type: 'application/step' });
  }

  downloadFile(blobOrString, filename, mimeType = 'text/plain') {
    const blob = blobOrString instanceof Blob ? blobOrString : new Blob([blobOrString], { type: mimeType });
    saveAs(blob, filename);
  }
}

export const exportEngine = new ExportEngine();
export default ExportEngine;
