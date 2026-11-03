/**
 * Real dimensions of the MGU-K teardown scene [m]. Every constant states whether it is a
 * published value or an ASSUMPTION; nothing here is a scraped CAD figure.
 *
 * PRIMARY REFERENCE: FIA Formula 1 Technical Regulations 2014–2025 (Power Unit, MGU-K) and
 * the FIA 2014 Power Unit leaflet
 * https://www.fia.com/sites/default/files/publication/file/FIA%20F1%20Power%20Unit%20leaflet.pdf
 * Published there (article numbers to be verified, as in model.ts): MGU-K max speed 50 000 rpm,
 * max power 120 kW, minimum mass 7 kg; ES (battery) minimum mass 20 kg; tyre/wheel envelope
 * (2022+: 18 in rim, rear tyre ≈ 0.405 m wide, overall diameter ≈ 0.72 m).
 * The FIA does NOT publish the machine envelope, so the MGU-K outline is ASSUMED from
 * the published 7 kg: a surface-PM machine has a mean density ≈ 5000 kg/m³ → ≈ 1.4 L, i.e. a
 * cylinder Ø 0.13 m × 0.105 m (π·0.065²·0.105 ≈ 1.39 L). Internal proportions follow a
 * generic high-speed surface-PM synchronous machine (12 slots / 8 poles, thin magnets).
 */

/** Scene units per metre: the 0.13 m machine is drawn 4× so it stays legible next to the wheel. */
export const SCENE_SCALE = 4;

// ---- MGU-K machine -------------------------------------------------------------------
/** Housing outer radius. ASSUMPTION (from 7 kg ≈ 1.4 L, see header). */
export const HOUSING_R = 0.065;
/** Housing wall thickness. ASSUMPTION. */
export const HOUSING_WALL = 0.004;
/** Housing total axial length incl. end caps. ASSUMPTION (see header). */
export const HOUSING_L = 0.105;
/** End-cap thickness. ASSUMPTION. */
export const CAP_T = 0.006;

/** Stator core outer radius. ASSUMPTION (housing R − wall − 2 mm clearance). */
export const STATOR_R_OUT = 0.059;
/** Stator bore radius. ASSUMPTION. */
export const STATOR_R_BORE = 0.0335;
/** Slot bottom radius (slot depth = this − bore). ASSUMPTION. */
export const SLOT_R_BOTTOM = 0.05;
/** Number of stator slots. ASSUMPTION: generic 12-slot / 8-pole fractional-free PMSM. */
export const SLOT_COUNT = 12;
/** Fraction of the slot pitch that is open slot (rest is tooth). ASSUMPTION. */
export const SLOT_FILL = 0.5;
/** Laminated stack length. ASSUMPTION. */
export const STACK_L = 0.07;
/** Copper end-turn overhang beyond the stack, per side. ASSUMPTION. */
export const END_TURN_L = 0.01;

/** Number of rotor poles (magnet segments). ASSUMPTION. */
export const POLE_COUNT = 8;
/** Magnet outer radius (air gap 1.5 mm to the bore). ASSUMPTION. */
export const MAGNET_R_OUT = 0.032;
/** Magnet radial thickness. ASSUMPTION. */
export const MAGNET_T = 0.004;
/** Shaft radius. ASSUMPTION. */
export const SHAFT_R = 0.011;
/** Shaft length, from the rear shaft end (gear side) to the front tip, centred on the stack. ASSUMPTION. */
export const SHAFT_L = 0.15;

// ---- Gear coupling to the crankshaft ------------------------------------------------
/** Gear module. ASSUMPTION (the real MGU-K/crank gear data are not published). */
export const GEAR_MODULE = 0.0025;
/** MGU-K pinion tooth count. ASSUMPTION. */
export const PINION_TEETH = 18;
/** Crank-side gear tooth count. ASSUMPTION. Ratio 60/18 = 3.33: 50 000 rpm ↔ 15 000 rpm crank (published rpm limits). */
export const CRANK_GEAR_TEETH = 60;
/** Gear face width. ASSUMPTION. */
export const GEAR_W = 0.016;
/** Pinion pitch radius [m] = module·z/2. Derived. */
export const PINION_R = (GEAR_MODULE * PINION_TEETH) / 2;
/** Crank gear pitch radius [m]. Derived. */
export const CRANK_GEAR_R = (GEAR_MODULE * CRANK_GEAR_TEETH) / 2;
/** Centre distance between MGU-K shaft and crankshaft [m]. Derived. */
export const GEAR_CENTRE_DISTANCE = PINION_R + CRANK_GEAR_R;
/** Gear-plane offset behind the housing rear face (z < 0 is behind). ASSUMPTION. */
export const GEAR_Z = -0.03;

// ---- Wheel / axle reference ------------------------------------------------------------
/** Rear tyre overall radius. Published: FIA TR 2022+ overall diameter ≈ 0.72 m (verify article). */
export const WHEEL_R = 0.36;
/** Rear tyre width. Published: FIA TR 2022+ ≈ 0.405 m (verify article). */
export const WHEEL_W = 0.405;
/** Rim radius, 18 in nominal. Published (FIA TR 2022+ wheel size). */
export const RIM_R = 0.2286;
/** Wheel centre position relative to the MGU-K axis (x: along the car, z: behind). ASSUMPTION (layout only). */
export const WHEEL_X = -0.8;
export const WHEEL_Z = -0.32;
/** Axle radius. ASSUMPTION. */
export const AXLE_R = 0.018;

// ---- Power electronics and battery ---------------------------------------------------------
/** Inverter / converter box (CE) size x·y·z. ASSUMPTION: ≈ 6 L, min. CE mass 2 kg-class. */
export const INVERTER = { x: 0.3, y: 0.18, z: 0.1 } as const;
/** Energy-store pack size x·y·z. ASSUMPTION: ≈ 13 L ↔ published ≥ 20 kg minimum mass at ≈ 1.5 kg/L. */
export const BATTERY = { x: 0.4, y: 0.26, z: 0.13 } as const;
/** Inverter and battery centre x relative to the MGU-K axis. ASSUMPTION (layout only). */
export const INVERTER_X = 0.4;
export const BATTERY_X = 0.95;
/** Power-cable radius. ASSUMPTION (HV cable ≈ 8 mm). */
export const CABLE_R = 0.005;

/** Overall wheel → rotor speed ratio is NOT a dimension: it comes from the model (see geometry). */
export const CRANK_TO_ROTOR_RATIO = PINION_TEETH / CRANK_GEAR_TEETH;
