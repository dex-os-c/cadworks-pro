# CADWorks Pro — Professional 3D CAD Engineering Suite

**CADWorks Pro** is a fully functional web-based 3D CAD application inspired by Dassault Systèmes SolidWorks. Built with precision engineering, modern WebGL/Three.js rendering, and a parametric feature rebuild kernel.

---

## 🏛️ System Architecture

```
cadworks/
├── index.html                    # Application entry HTML with SolidWorks splash screen
├── package.json                  # Dependencies & scripts
├── vite.config.js                # Vite build configuration
├── src/
│   ├── main.jsx                  # React 18 bootstrap
│   ├── App.jsx                   # Central application logic & model rebuild loop
│   ├── index.css                 # SolidWorks dark engineering UI styling
│   │
│   ├── store/
│   │   └── cadStore.js           # Zustand + Immer reactive state management
│   │
│   ├── kernel/                   # Core Geometry Engine
│   │   ├── GeometryEngine.js     # 3D CSG Booleans, Extrude, Revolve, Sweep, Loft, Fillet, Chamfer, Shell, Mass Props
│   │   ├── SketchEngine.js       # 2D geometry creation, offsets, mirroring, graph closure detection
│   │   ├── ConstraintSolver.js   # Gauss-Seidel 2D constraint solver (coincident, parallel, dims, etc.)
│   │   ├── MaterialLibrary.js    # Engineering materials (Steels, Al, Ti, Plastics) with physical constants
│   │   ├── ExportEngine.js       # STL (Binary & ASCII), OBJ, DXF, and ISO 10303 STEP exporter
│   │   └── ImportEngine.js       # Binary/ASCII STL, Wavefront OBJ, AutoCAD DXF parser
│   │
│   ├── features/
│   │   └── FeatureEngine.js      # Parametric feature tree rebuild engine (history rollback & regeneration)
│   │
│   ├── viewport/                 # High-Performance 3D Viewport
│   │   ├── Viewport3D.jsx        # R3F Canvas, OrbitControls, Reference Planes, Shading, Sharp Edges
│   │   ├── ViewportPicker.js     # Raycaster, 3D to sketch plane projection, vertex & edge snapping
│   │   └── GizmoManager.js       # Interactive 3D triad and transform gizmos
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── CommandManager.jsx # SolidWorks Ribbon Toolbar (Features, Sketch, Surfaces, Sheet Metal, etc.)
│   │   │   ├── FeatureTree.jsx    # FeatureManager Design Tree (history, planes, suppression, rollback)
│   │   │   ├── PropertyPanel.jsx  # PropertyManager slide-out with Check / Cancel confirmation
│   │   │   ├── StatusBar.jsx      # MMGS units, grid/snap toggles, tool status
│   │   │   └── MainLayout.jsx     # Master flex layout
│   │   ├── dialogs/
│   │   │   ├── ExportDialog.jsx   # Multi-format CAD export
│   │   │   ├── MaterialDialog.jsx # Searchable material database
│   │   │   └── MassPropsDialog.jsx# Real-time Volume, Mass, Center of Mass, Moments of Inertia
│   │   └── common/
│   │       ├── NumericInput.jsx   # High-precision engineering spinner input with units
│   │       └── TreeView.jsx       # Reusable hierarchical tree component
│   │
│   ├── simulation/
│   │   ├── FEAEngine.js          # Finite Element Analysis (stiffness, displacement, von Mises stress)
│   │   └── ResultsViewer.jsx     # FEA HUD with interactive solver & safety factor color scale
│   │
│   ├── drawing/
│   │   └── DrawingManager.js     # 2D Engineering drawings (Front, Top, Right, Isometric orthographic projections)
│   │
│   ├── assembly/
│   │   └── AssemblyManager.js    # Component insertion, mates (coincident, concentric, parallel), exploded views
│   │
│   └── utils/
│       ├── math.js               # Linear algebra, BSP CSG polygon clipping, trigonometry
│       ├── constants.js          # SolidWorks theme constants, tool IDs, material properties
│       └── shortcuts.js          # Industry-standard keyboard shortcuts
```

---

## 🚀 Key Features

1. **SolidWorks-Inspired UI Layout**:
   - **CommandManager**: Ribbon toolbar with Features, Sketch, Surfaces, Sheet Metal, Assembly, Evaluate, and Drawing tabs.
   - **FeatureManager Design Tree**: Left sidebar showing Document origin, Reference Planes (Front, Top, Right), and feature timeline.
   - **PropertyManager**: Contextual parameter editor with green OK checkmark and red Cancel buttons.
   - **ViewCube & Triad**: 3D orientation controls with standard views (Top, Front, Right, Isometric).

2. **2D Sketching**:
   - Lines, Rectangles, Circles, Arcs, Splines, Slots, and Points.
   - Smart Dimensioning and Construction Geometry toggle.
   - Interactive projection onto Front (XY), Top (XZ), and Right (YZ) planes.
   - Snapping to grid and entity vertices/midpoints.

3. **3D Parametric Modeling**:
   - **Extrude Boss/Base & Extrude Cut**: Blind, Mid Plane, Through All.
   - **Revolve Boss/Base & Revolve Cut**: Full or partial angle around sketch axes.
   - **Sweep & Loft**: Profile sweeping along 3D guide curves.
   - **Fillet & Chamfer**: Edge rounding and beveling.
   - **Shell**: Hollowed out parts with user-specified wall thickness.
   - **Hole Wizard**: Standard circular through and blind holes.
   - **Patterns & Mirror**: Linear and circular array patterning across planes.

4. **Engineering Materials & Physical Evaluation**:
   - Library of steels (AISI 1020, 304SS, 4140), aluminums (6061-T6, 7075-T6), titanium, brass, copper, ABS, nylon, carbon fiber.
   - **Mass Properties Calculator**: Mass, volume, surface area, center of gravity ($x, y, z$), and principal moments of inertia ($I_{xx}, I_{yy}, I_{zz}$).

5. **Simulation & Basic FEA**:
   - Automated mesh generation and boundary condition fixtures.
   - Real structural finite element solution computing von Mises stress (MPa), max deflections, and Factor of Safety (FOS) with rainbow contour map visualization.

6. **Assembly Design**:
   - Insert multiple components.
   - Mate constraints: Coincident, Concentric, Parallel, Distance, Angle.
   - Exploded view generation.

7. **Export & Import**:
   - Export: **STL (Binary & ASCII)**, **Wavefront OBJ**, **AutoCAD DXF**, **ISO 10303 STEP**, and Native Project JSON.
   - Import: STL, OBJ, DXF, and Project JSON.

8. **Keyboard Shortcuts**:
   - `Ctrl+Z` / `Ctrl+Y`: Undo / Redo
   - `Ctrl+S`: Save Project
   - `F5`: Rebuild Feature Tree
   - `L`: Line tool
   - `R`: Rectangle tool
   - `C`: Circle tool
   - `D`: Smart Dimension
   - `E`: Extrude feature
   - `Space`: Reset to Isometric view
   - `Ctrl+1` through `Ctrl+7`: Standard SolidWorks view orientations

---

## 🏃 Running the Application

To start the development server:
```bash
npm run dev
```
Open your browser at `http://localhost:5173/`.

To build for production:
```bash
npm run build
```
Production assets are generated in `dist/`.
