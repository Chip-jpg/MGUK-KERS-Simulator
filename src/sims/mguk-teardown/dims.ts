/**
 * Dimensions of the MGU-K teardown scene. Every constant states whether it is a
 * PUBLISHED value or an ASSUMPTION; nothing here is a scraped CAD figure.
 *
 * PRIMARY REFERENCE: FIA 2025 F1 Technical Regulations, Issue 3 (07 Apr 2025),
 * Art. 5.3.3: MGU-K minimum mass 7 kg, max speed 50 000 rpm, max power 120 kW;
 * Art. 5.5.3: ES cells and inter-cell connections 20–25 kg;
 * Art. 5.13.5: DC voltage ≤ 1000 V.
 * https://www.fia.com/sites/default/files/documents/fia_2025_formula_1_technical_regulations_-_issue_03_-_2025-04-07.pdf
 * Wheel/tyre/disc sizes come from the shared car (src/sims/shared/car/dims.ts, CAR_DIMS).
 *
 * The FIA does NOT publish the machine envelope, so the MGU-K outline is ASSUMED from the
 * published 7 kg: a liquid-cooled surface-PM machine has a mean density ≈ 5000 kg/m³ → ≈ 1.4 L,
 * i.e. a cylinder Ø 0.13 m × 0.105 m (π·0.065²·0.105 ≈ 1.39 L). Internal layout follows the
 * automotive hairpin PMSMs of the reference photos (refs 05, 06, 10): 48 slots, 4 hairpin
 * layers, 8 surface-magnet poles under a carbon retaining sleeve. All internal sizes are
 * ILLUSTRATIVE.
 *
 * MGU-K parts are modelled in millimetres (MM_* constants below are mm); the layout of the
 * whole scene is in metres.
 */

/** Scene units per metre. */
export const SCENE_SCALE = 4;
/**
 * ILLUSTRATIVE magnification of the MGU-K and its gear pair against wheel, inverter and ES
 * (2:1), so the 0.13 m machine stays legible next to a 0.72 m wheel. Stated on its label.
 */
export const MGUK_ZOOM = 2;

// ---- MGU-K machine [m] (the tests compare these) ----------------------------------------
/** Housing (cooling-jacket) outer radius. ASSUMPTION (from 7 kg ≈ 1.4 L, see header). */
export const HOUSING_R = 0.065;
/** Housing total axial length incl. end bells. ASSUMPTION (see header). */
export const HOUSING_L = 0.105;
/** Stator core outer radius. ASSUMPTION (inside the 9 mm cooling jacket). */
export const STATOR_R_OUT = 0.056;
/** Stator bore radius. ASSUMPTION. */
export const STATOR_R_BORE = 0.034;
/** Slot bottom radius (slot depth = this − bore). ASSUMPTION. */
export const SLOT_R_BOTTOM = 0.05;
/** Number of stator slots. ASSUMPTION: 48 slots / 8 poles, as in hairpin traction machines. */
export const SLOT_COUNT = 48;
/** Hairpin conductors per slot (radial layers). ASSUMPTION. */
export const HAIRPIN_LAYERS = 4;
/** Hairpin coil pitch [slots] (full pitch = 48 / 8 = 6). ASSUMPTION. */
export const HAIRPIN_PITCH = 6;
/** Laminated stack length. ASSUMPTION. */
export const STACK_L = 0.064;
/** Number of rotor poles (magnet rows). ASSUMPTION. */
export const POLE_COUNT = 8;
/** Axial magnet segments per pole (segmented against eddy currents). ASSUMPTION. */
export const MAGNET_SEGMENTS = 4;
/** Magnet outer radius. ASSUMPTION (1 mm sleeve + 1.5 mm air gap to the bore). */
export const MAGNET_R_OUT = 0.0315;
/** Magnet radial thickness. ASSUMPTION. */
export const MAGNET_T = 0.004;
/** Carbon-fibre retaining-sleeve thickness (holds the magnets at 50 000 rpm). ASSUMPTION. */
export const SLEEVE_T = 0.001;
/** Shaft radius at the bearings. ASSUMPTION. */
export const SHAFT_R = 0.011;

// ---- Gear coupling ("Riduzione semplificata (1 coppia)") ----------------------------------
/**
 * The real MGU-K drives the crankshaft through a gear train whose data are not published
 * (TR25 Art. 5.3.3 only fixes the coupling). Drawn as ONE gear pair, an honest simplification.
 */
/** Gear module. ASSUMPTION. */
export const GEAR_MODULE = 0.0025;
/** Pressure angle [rad] of the involute teeth. ASSUMPTION (standard 20°). */
export const PRESSURE_ANGLE = (20 * Math.PI) / 180;
/** MGU-K pinion tooth count. ASSUMPTION. */
export const PINION_TEETH = 18;
/** Crank-side gear tooth count. ASSUMPTION. 60/18 = 3.33: 50 000 rpm ↔ 15 000 rpm crank (published rpm limits). */
export const CRANK_GEAR_TEETH = 60;
/** Gear face width. ASSUMPTION. */
export const GEAR_W = 0.014;
/** Pinion pitch radius [m] = module·z/2. Derived. */
export const PINION_R = (GEAR_MODULE * PINION_TEETH) / 2;
/** Crank gear pitch radius [m]. Derived. */
export const CRANK_GEAR_R = (GEAR_MODULE * CRANK_GEAR_TEETH) / 2;
/** Centre distance between MGU-K shaft and crank gear [m]. Derived. */
export const GEAR_CENTRE_DISTANCE = PINION_R + CRANK_GEAR_R;
/** Direction of the crank gear seen from the MGU-K axis [rad] (layout only). ASSUMPTION. */
export const CRANK_GEAR_DIR = (200 * Math.PI) / 180;
/** Rotor turns per crank turn is 60/18; crank turns per rotor turn: */
export const CRANK_TO_ROTOR_RATIO = PINION_TEETH / CRANK_GEAR_TEETH;

// ---- Scene layout [m, scene root before SCENE_SCALE]. ASSUMPTIONS (layout only) ----------
/** MGU-K axis height above the floor. */
export const MGUK_Y = 0.3;
/** Wheel centre: x of the inner tyre face, z of the wheel plane. */
export const WHEEL_INNER_X = -0.44;
export const WHEEL_Z = -0.58;
/** Schematic gearbox/differential box between crank gear shaft and half-shaft (not to scale). */
export const GEARBOX = { x: 0.15, y: 0.13, z: 0.14 } as const;

// ---- Power electronics and energy store [m] ------------------------------------------------
/** Inverter (CE) case x·y·z. ASSUMPTION: ≈ 4.7 L. */
export const INVERTER = { x: 0.26, y: 0.09, z: 0.2 } as const;
/** Inverter centre. ASSUMPTION (layout only). */
export const INVERTER_POS = { x: 0.44, y: 0.36, z: -0.16 } as const;
/** Energy-store case x·y·z. ASSUMPTION: ≈ 13.5 L ↔ 20–25 kg of cells (Art. 5.5.3) at ≈ 1.7 kg/L. */
export const BATTERY = { x: 0.42, y: 0.12, z: 0.27 } as const;
/** Energy-store centre. ASSUMPTION (layout only). */
export const BATTERY_POS = { x: 0.6, y: 0.075, z: -0.6 } as const;
/** Cells in the ES drawn as rows × columns of prismatic cells. ILLUSTRATIVE count. */
export const ES_ROWS = 4;
export const ES_COLS = 14;
/** HV cable radius (orange). ASSUMPTION (≈ 9 mm cable). */
export const CABLE_R = 0.0045;
/** Share of the friction-brake heat taken by ONE rear disc. ASSUMPTION: 40 % rear axle / 2 discs. */
export const REAR_DISC_HEAT_SHARE = 0.2;
