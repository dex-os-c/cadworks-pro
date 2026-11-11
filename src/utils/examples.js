// CADWorks Pro - Built-In Parametric Example Models
import { FEATURE_TYPES, SKETCH_ENTITY_TYPES } from './constants.js';

export const CAD_EXAMPLES = [
  {
    id: 'l_bracket',
    name: 'Mounting L-Bracket',
    description: 'Structural aluminum bracket with mounting holes and reinforced fillet',
    material: 'Aluminum_6061',
    create: () => {
      const sk1 = 'sk_lbracket_base';
      const sk2 = 'sk_lbracket_vert';
      const sk3 = 'sk_lbracket_holes';

      return {
        documentName: 'Mounting_L_Bracket',
        activeMaterial: 'Aluminum_6061',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'b1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -35, y: -20 }, p2: { x: 35, y: -20 } },
            { id: 'b2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 35, y: -20 }, p2: { x: 35, y: 20 } },
            { id: 'b3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 35, y: 20 }, p2: { x: -35, y: 20 } },
            { id: 'b4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -35, y: 20 }, p2: { x: -35, y: -20 } },
          ],
          [sk2]: [
            { id: 'v1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -35, y: -20 }, p2: { x: -23, y: -20 } },
            { id: 'v2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -23, y: -20 }, p2: { x: -23, y: 20 } },
            { id: 'v3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -23, y: 20 }, p2: { x: -35, y: 20 } },
            { id: 'v4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -35, y: 20 }, p2: { x: -35, y: -20 } },
          ],
          [sk3]: [
            { id: 'h1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 15, y: 0 }, radius: 5 },
            { id: 'h2', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: -10, y: 0 }, radius: 5 },
          ],
        },
        features: [
          {
            id: 'feat_sk1',
            name: 'Sketch1 (Base Plate)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_ext1',
            name: 'Boss-Extrude1 (Base)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 12,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_sk1'],
          },
          {
            id: 'feat_sk2',
            name: 'Sketch2 (Upright Leg)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_ext2',
            name: 'Boss-Extrude2 (Upright)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk2,
            depth: 55,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_sk2'],
          },
          {
            id: 'feat_sk3',
            name: 'Sketch3 (Holes)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk3,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_cut1',
            name: 'Cut-Extrude1 (Mounting Holes)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk3,
            depth: 25,
            direction: 'throughall',
            visible: true,
            suppressed: false,
            parentIds: ['feat_sk3'],
          },
          {
            id: 'feat_fillet1',
            name: 'Fillet1 (Corner Blend)',
            type: FEATURE_TYPES.FILLET,
            radius: 4,
            visible: true,
            suppressed: false,
          },
        ],
      };
    },
  },

  {
    id: 'hex_bolt',
    name: 'Hex Bolt (M12 Fastener)',
    description: 'Precision ISO metric hex head cap screw with cylindrical shank',
    material: 'Steel_1020',
    create: () => {
      const sk1 = 'sk_hex_head';
      const sk2 = 'sk_bolt_shank';

      // 6-sided regular hexagon with radius 13mm
      const hexPts = [];
      for (let i = 0; i < 6; i++) {
        const ang = (i * 60 * Math.PI) / 180;
        hexPts.push({ x: 13 * Math.cos(ang), y: 13 * Math.sin(ang) });
      }

      const hexLines = hexPts.map((pt, i) => ({
        id: `hx_${i}`,
        type: SKETCH_ENTITY_TYPES.LINE,
        p1: pt,
        p2: hexPts[(i + 1) % 6],
      }));

      return {
        documentName: 'Hex_Bolt_M12',
        activeMaterial: 'Steel_1020',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: hexLines,
          [sk2]: [
            { id: 'sh1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 6 },
          ],
        },
        features: [
          {
            id: 'feat_sk_head',
            name: 'Sketch1 (Hex Head)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_ext_head',
            name: 'Boss-Extrude1 (Head)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 8,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_sk_head'],
          },
          {
            id: 'feat_sk_shank',
            name: 'Sketch2 (Shank Profile)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_ext_shank',
            name: 'Boss-Extrude2 (Shank)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk2,
            depth: 50,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_sk_shank'],
          },
          {
            id: 'feat_chm_tip',
            name: 'Chamfer1 (Lead-In)',
            type: FEATURE_TYPES.CHAMFER,
            radius: 1.5,
            visible: true,
            suppressed: false,
          },
        ],
      };
    },
  },

  {
    id: 'bearing_block',
    name: 'Pillow Block Bearing',
    description: 'Industrial split bearing pillow block housing with shaft bore and bolt slots',
    material: 'Steel_1020',
    create: () => {
      const sk1 = 'sk_pillow_base';
      const sk2 = 'sk_pillow_housing';
      const sk3 = 'sk_pillow_bore';

      return {
        documentName: 'Pillow_Block_Housing',
        activeMaterial: 'Steel_1020',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'pb1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -45, y: -15 }, p2: { x: 45, y: -15 } },
            { id: 'pb2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 45, y: -15 }, p2: { x: 45, y: 15 } },
            { id: 'pb3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 45, y: 15 }, p2: { x: -45, y: 15 } },
            { id: 'pb4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -45, y: 15 }, p2: { x: -45, y: -15 } },
          ],
          [sk2]: [
            { id: 'ph1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 24 },
          ],
          [sk3]: [
            { id: 'bor1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 12 },
            { id: 'bor2', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: -32, y: 0 }, radius: 4 },
            { id: 'bor3', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 32, y: 0 }, radius: 4 },
          ],
        },
        features: [
          {
            id: 'feat_pb_sk1',
            name: 'Sketch1 (Base Flange)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_pb_ext1',
            name: 'Boss-Extrude1 (Flange)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 14,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_pb_sk1'],
          },
          {
            id: 'feat_pb_sk2',
            name: 'Sketch2 (Bearing Hub)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_pb_ext2',
            name: 'Boss-Extrude2 (Hub)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk2,
            depth: 32,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_pb_sk2'],
          },
          {
            id: 'feat_pb_sk3',
            name: 'Sketch3 (Shaft & Bolt Bores)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk3,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_pb_cut1',
            name: 'Cut-Extrude1 (Center Bore)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk3,
            depth: 40,
            direction: 'throughall',
            visible: true,
            suppressed: false,
            parentIds: ['feat_pb_sk3'],
          },
        ],
      };
    },
  },

  {
    id: 'piston_head',
    name: 'Engine Piston Head',
    description: 'Revolved automotive piston with crown, compression ring grooves, and wrist pin bore',
    material: 'Aluminum_7075',
    create: () => {
      const sk1 = 'sk_piston_rev';
      const sk2 = 'sk_wrist_pin';

      // Half silhouette of piston for 360 deg revolution
      const profile = [
        { id: 'p_axis', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 0, y: 55 }, construction: true },
        { id: 'p1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 55 }, p2: { x: 30, y: 55 } }, // Crown top
        { id: 'p2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 55 }, p2: { x: 30, y: 46 } }, // Upper land
        { id: 'p3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 46 }, p2: { x: 26, y: 46 } }, // Ring groove 1 in
        { id: 'p4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 26, y: 46 }, p2: { x: 26, y: 42 } }, // Ring groove 1 bot
        { id: 'p5', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 26, y: 42 }, p2: { x: 30, y: 42 } }, // Ring groove 1 out
        { id: 'p6', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 42 }, p2: { x: 30, y: 36 } }, // Land 2
        { id: 'p7', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 36 }, p2: { x: 26, y: 36 } }, // Ring groove 2 in
        { id: 'p8', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 26, y: 36 }, p2: { x: 26, y: 32 } }, // Ring groove 2 bot
        { id: 'p9', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 26, y: 32 }, p2: { x: 30, y: 32 } }, // Ring groove 2 out
        { id: 'p10', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 32 }, p2: { x: 30, y: 0 } },  // Skirt
        { id: 'p11', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: 0 }, p2: { x: 0, y: 0 } },    // Bottom
        { id: 'p12', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 0, y: 0 }, p2: { x: 0, y: 55 } },    // Centerline
      ];

      return {
        documentName: 'Automotive_Piston',
        activeMaterial: 'Aluminum_7075',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: profile,
          [sk2]: [
            { id: 'pin1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 22 }, radius: 9 },
          ],
        },
        features: [
          {
            id: 'feat_pist_sk1',
            name: 'Sketch1 (Piston Profile)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_pist_rev1',
            name: 'Revolve-Boss1 (Body)',
            type: FEATURE_TYPES.REVOLVE_BOSS,
            sketchId: sk1,
            angle: 360,
            visible: true,
            suppressed: false,
            parentIds: ['feat_pist_sk1'],
          },
          {
            id: 'feat_pist_sk2',
            name: 'Sketch2 (Wrist Pin Bore)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Right',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_pist_cut1',
            name: 'Cut-Extrude1 (Pin Bore)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk2,
            depth: 70,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_pist_sk2'],
          },
        ],
      };
    },
  },

  {
    id: 'pipe_flange',
    name: 'Flanged Pressure Fitting',
    description: 'High-pressure circular bolt flange with central bore and bolt circle',
    material: 'Steel_304SS',
    create: () => {
      const sk1 = 'sk_flange_disc';
      const sk2 = 'sk_flange_neck';
      const sk3 = 'sk_flange_bore';

      return {
        documentName: 'Flanged_Fitting_304SS',
        activeMaterial: 'Steel_304SS',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'fld1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 45 },
          ],
          [sk2]: [
            { id: 'fln1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 26 },
          ],
          [sk3]: [
            { id: 'c_bore', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 18 },
            { id: 'b_hole1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 33, y: 0 }, radius: 4.5 },
            { id: 'b_hole2', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: -33, y: 0 }, radius: 4.5 },
            { id: 'b_hole3', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 33 }, radius: 4.5 },
            { id: 'b_hole4', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: -33 }, radius: 4.5 },
          ],
        },
        features: [
          {
            id: 'feat_fl_sk1',
            name: 'Sketch1 (Flange Disc)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_fl_ext1',
            name: 'Boss-Extrude1 (Disc)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 12,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_fl_sk1'],
          },
          {
            id: 'feat_fl_sk2',
            name: 'Sketch2 (Welding Neck)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_fl_ext2',
            name: 'Boss-Extrude2 (Neck)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk2,
            depth: 35,
            direction: 'blind',
            visible: true,
            suppressed: false,
            parentIds: ['feat_fl_sk2'],
          },
          {
            id: 'feat_fl_sk3',
            name: 'Sketch3 (Bores & Bolt Circle)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk3,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_fl_cut1',
            name: 'Cut-Extrude1 (Through Holes)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk3,
            depth: 50,
            direction: 'throughall',
            visible: true,
            suppressed: false,
            parentIds: ['feat_fl_sk3'],
          },
        ],
      };
    },
  },

  {
    id: 'sheet_enclosure',
    name: 'Sheet Metal U-Channel',
    description: 'Thin-feature parametric sheet metal enclosure channel with uniform wall thickness',
    material: 'Aluminum_6061',
    create: () => {
      const sk1 = 'sk_u_channel';

      return {
        documentName: 'Sheet_Metal_Channel',
        activeMaterial: 'Aluminum_6061',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'u1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -30, y: 25 }, p2: { x: -30, y: -15 } },
            { id: 'u2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -30, y: -15 }, p2: { x: 30, y: -15 } },
            { id: 'u3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 30, y: -15 }, p2: { x: 30, y: 25 } },
          ],
        },
        features: [
          {
            id: 'feat_u_sk1',
            name: 'Sketch1 (U-Profile)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_u_ext1',
            name: 'Boss-Extrude1 (Thin Feature Channel)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 80,
            direction: 'blind',
            thin: true,
            wallThickness: 2.5,
            visible: true,
            suppressed: false,
            parentIds: ['feat_u_sk1'],
          },
        ],
      };
    },
  },

  {
    id: 'spur_gear_blank',
    name: 'Spur Gear Blank',
    description: 'Machined gear blank with hub, web recess, and keyed shaft bore',
    material: 'Steel_4140',
    create: () => {
      const sk1 = 'sk_gear_rim';
      const sk2 = 'sk_gear_bore';
      const sk3 = 'sk_gear_web';

      return {
        documentName: 'Spur_Gear_Blank_4140',
        activeMaterial: 'Steel_4140',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'g_rim', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 42 },
          ],
          [sk2]: [
            { id: 'g_bore', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 12 },
            // Keyway notch (5mm wide, 3mm deep)
            { id: 'k1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -2.5, y: 11.7 }, p2: { x: -2.5, y: 15 } },
            { id: 'k2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -2.5, y: 15 }, p2: { x: 2.5, y: 15 } },
            { id: 'k3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 2.5, y: 15 }, p2: { x: 2.5, y: 11.7 } },
          ],
          [sk3]: [
            { id: 'g_web', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 0, y: 0 }, radius: 30 },
          ],
        },
        features: [
          {
            id: 'feat_gear_sk1',
            name: 'Sketch1 (Outer Rim)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_gear_ext1',
            name: 'Boss-Extrude1 (Blank Disc)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 22,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_gear_sk1'],
          },
          {
            id: 'feat_gear_sk2',
            name: 'Sketch2 (Keyed Bore)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_gear_cut1',
            name: 'Cut-Extrude1 (Shaft & Keyway)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk2,
            depth: 30,
            direction: 'throughall',
            visible: true,
            suppressed: false,
            parentIds: ['feat_gear_sk2'],
          },
          {
            id: 'feat_gear_chamfer',
            name: 'Chamfer1 (Rim Edges)',
            type: FEATURE_TYPES.CHAMFER,
            radius: 1.0,
            visible: true,
            suppressed: false,
          },
        ],
      };
    },
  },

  {
    id: 'connecting_rod',
    name: 'Engine Connecting Rod',
    description: 'High-strength forged connecting rod with crank journal, pin eye, and connecting shank',
    material: 'Titanium_Ti6Al4V',
    create: () => {
      const sk1 = 'sk_rod_big_end';
      const sk2 = 'sk_rod_small_end';
      const sk3 = 'sk_rod_shank';
      const sk4 = 'sk_rod_bores';

      return {
        documentName: 'Titanium_Connecting_Rod',
        activeMaterial: 'Titanium_Ti6Al4V',
        rollbackIndex: -1,
        sketchEntities: {
          [sk1]: [
            { id: 'be1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: -45, y: 0 }, radius: 24 },
          ],
          [sk2]: [
            { id: 'se1', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 45, y: 0 }, radius: 15 },
          ],
          [sk3]: [
            { id: 'sh1', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -45, y: 8 }, p2: { x: 45, y: 6 } },
            { id: 'sh2', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 45, y: 6 }, p2: { x: 45, y: -6 } },
            { id: 'sh3', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: 45, y: -6 }, p2: { x: -45, y: -8 } },
            { id: 'sh4', type: SKETCH_ENTITY_TYPES.LINE, p1: { x: -45, y: -8 }, p2: { x: -45, y: 8 } },
          ],
          [sk4]: [
            { id: 'crank_bore', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: -45, y: 0 }, radius: 15 },
            { id: 'pin_bore', type: SKETCH_ENTITY_TYPES.CIRCLE, center: { x: 45, y: 0 }, radius: 8 },
          ],
        },
        features: [
          {
            id: 'feat_rod_sk1',
            name: 'Sketch1 (Big End Boss)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk1,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_rod_ext1',
            name: 'Boss-Extrude1 (Big End)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk1,
            depth: 22,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_rod_sk1'],
          },
          {
            id: 'feat_rod_sk2',
            name: 'Sketch2 (Small End Boss)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk2,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_rod_ext2',
            name: 'Boss-Extrude2 (Small End)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk2,
            depth: 18,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_rod_sk2'],
          },
          {
            id: 'feat_rod_sk3',
            name: 'Sketch3 (Shank Profile)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk3,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_rod_ext3',
            name: 'Boss-Extrude3 (Connecting Shank)',
            type: FEATURE_TYPES.EXTRUDE_BOSS,
            sketchId: sk3,
            depth: 12,
            direction: 'midplane',
            visible: true,
            suppressed: false,
            parentIds: ['feat_rod_sk3'],
          },
          {
            id: 'feat_rod_sk4',
            name: 'Sketch4 (Crank & Pin Bores)',
            type: FEATURE_TYPES.SKETCH,
            sketchId: sk4,
            plane: 'Front',
            visible: true,
            suppressed: false,
          },
          {
            id: 'feat_rod_cut1',
            name: 'Cut-Extrude1 (Bearing Bores)',
            type: FEATURE_TYPES.EXTRUDE_CUT,
            sketchId: sk4,
            depth: 30,
            direction: 'throughall',
            visible: true,
            suppressed: false,
            parentIds: ['feat_rod_sk4'],
          },
        ],
      };
    },
  },
];
