import createChart from "./plot.js";

const constants = {
    roughness: 0.2, // mm
    maxPressure: 200, // m head
    min_absolute_pressure: 30, // kPa
    costOfBurying: 1000, // $/km
    pump_flow: 1, // m^3/s
    pump_cost: 15000000, // $/pump
    absolute_atm_pressure: 100, // kPa
    L: 304, // km
    delta_z: 0.2, // km
    elevation_curve_param_a: 1.5,
    elevation_curve_param_b: 6,
    elevation_curve_param_c: -5,
    z_A: 0.3, // km,
    z_B: 0.5, // km
    fluid_density: 1000, // kg/m^3
    u: 0.001, // dynamic viscosity of the fluid,
    parallel_pipes: true,
};

const relative_roughness = (diameter_meters: number) => {
    let roughness_meters = constants.roughness / 1000;
    return roughness_meters / diameter_meters;
};

const area = (diameter: number) => (Math.PI * diameter ** 2) / 4;

const straight_path_z = (distance_meters: number) => {
    return (
        ((constants.z_B * 1000 - constants.z_A * 1000) / (constants.L * 1000)) *
            distance_meters +
        constants.z_A * 1000
    );
};

interface PipeData {
    diameter: number;
    cost: number; // $/km
    relative_roughness: number;
    area: number;
    q: number;
    v: number;
    Re: number;
    f: number;
}

const pipeDiameterToCost = (diameter: number) => {
    return 502857 * diameter - 321619;
};

const calculateFrictionFactor = (Re: number, relativeRoughness: number) => {
    // For laminar flow (Re < 2000), f can be calculated directly.
    if (Re < 2000) {
        return 64 / Re;
    }

    // For turbulent flow (Re >= 2000), use the Colebrook-White equation.
    let f = 0.08; // Initial guess for f
    const epsilon = 0.000001; // Convergence criteria
    const maxIter = 200; // Maximum number of iterations to prevent infinite loops

    for (let i = 0; i < maxIter; i++) {
        let fNew =
            1 /
            Math.pow(
                -2 *
                    Math.log10(
                        relativeRoughness / 3.7 + 2.51 / (Re * Math.sqrt(f))
                    ),
                2
            );
        // Check for convergence
        if (Math.abs(fNew - f) < epsilon) {
            return fNew;
        }
        f = fNew;
    }

    // If the function hasn't returned after the loop, the calculation failed to converge
    throw new Error("Failed to converge");
};

let lowest_cost = Number.MAX_VALUE;
let optimal_percent_bury: number = 0;
let optimal_number_pumps: number = 0;
let optimal_pipe_diameter: number = Number.MAX_VALUE;
let optimal_HGL: number[] = [];
let optimal_EGL: number[] = [];

// actual_diameters
let initial_diameter = 0.76026;
let max_diameter = 1.2;
let increment = 0.000001;

for (
    let diameter = initial_diameter;
    diameter < max_diameter;
    diameter += increment
) {
    let pipe_cost = pipeDiameterToCost(diameter); // cost per meter
    let effective_diameter = diameter * 2 ** (2 / 5);
    let actual_diameter = diameter;

    if (constants.parallel_pipes) {
        pipe_cost *= 2; // twice the cost per meter since now it's two parallel pipes
        diameter = effective_diameter; // the effective diameter of these parallel pipes
    }

    let pipe_relative_roughness = relative_roughness(diameter);
    let pipe_area = area(diameter);
    let pipe_q = constants.pump_flow;
    let pipe_v = pipe_q / pipe_area;
    let pipe_Re = (pipe_v * diameter * constants.fluid_density) / constants.u;
    let pipe_f = calculateFrictionFactor(pipe_Re, pipe_relative_roughness);

    let pipe: PipeData = {
        diameter,
        cost: pipe_cost,
        relative_roughness: pipe_relative_roughness,
        area: pipe_area,
        q: pipe_q,
        v: pipe_v,
        Re: pipe_Re,
        f: pipe_f,
    };

    for (
        let percent_bury = 0;
        percent_bury <= 0.000001;
        percent_bury += 0.00000001
    ) {
        let d_plot: number[] = [];
        let straight_path_z_plot: number[] = [];
        let d = 0;
        let pump_here = [true];
        let pump_head = [100];
        let z_meters = [
            (constants.elevation_curve_param_a +
                constants.elevation_curve_param_b * (d / (constants.L * 1000)) +
                constants.elevation_curve_param_c *
                    (d / (constants.L * 1000)) ** 2) *
                (0.2 * 1000),
        ];
        let pressure_head = [100];
        let pressure = [
            constants.absolute_atm_pressure +
                (1000 * 9.81 * pressure_head[0]) / 1000,
        ];
        let head_loss = [0];

        let HGL_plot: number[] = [pressure_head[d] + z_meters[d]];
        let EGL_plot: number[] = [HGL_plot[d] + pipe.v ** 2 / (2 * 9.81)];

        straight_path_z_plot.push(straight_path_z(d));
        d_plot.push(d);

        let total_bury = 0; // total meters down of burying per 1 meter
        let d_step = 1;
        while (d + d_step < constants.L * 1000) {
            d += d_step;
            straight_path_z_plot.push(straight_path_z(d));
            d_plot.push(d);

            pump_here[d] = false; // assume no pump
            let bury_distance = 0; // assume no burying

            // compute
            let compute_next_row = () => {
                pump_head[d] = pump_here[d] ? 100 : 0;

                z_meters[d] =
                    (constants.elevation_curve_param_a +
                        constants.elevation_curve_param_b *
                            (d / (constants.L * 1000)) +
                        constants.elevation_curve_param_c *
                            (d / (constants.L * 1000)) ** 2) *
                    (0.2 * 1000);

                let deviation = z_meters[d] - straight_path_z_plot[d];
                bury_distance = deviation * percent_bury;
                z_meters[d] = z_meters[d] - bury_distance;

                head_loss[d] =
                    (pipe.f * (d_step / pipe.diameter) * pipe.v ** 2) /
                    (2 * 9.81);

                pressure_head[d] =
                    pump_head[d] +
                    pressure_head[d - 1] -
                    (z_meters[d] - z_meters[d - 1]) -
                    head_loss[d];

                pressure[d] =
                    constants.absolute_atm_pressure +
                    (1000 * 9.81 * pressure_head[d]) / 1000;
            };
            compute_next_row();

            // Was no pump a good idea?
            if (pressure[d] < constants.min_absolute_pressure) {
                // If not add pump
                pump_here[d] = true;
            }

            // Recompute potentially without a pump:
            compute_next_row();

            // Was a pump a good idea
            if (!pump_here[d] && pressure_head[d] > constants.maxPressure) {
                // If not remove pump
                pump_here[d] = false;
            }
            compute_next_row();

            HGL_plot.push(pressure_head[d] + z_meters[d]);
            EGL_plot.push(HGL_plot[d] + pipe.v ** 2 / (2 * 9.81));
            total_bury += bury_distance;
        }

        let number_of_pumps = pump_here.filter((value) => value).length;
        let cost_of_pumps = 15000000 * number_of_pumps;
        let cost_of_piping = pipe.cost * constants.L;
        let cost_of_burying = 1 * total_bury; // $1 * (total meters distance * meters depth)

        let total_cost = cost_of_piping + cost_of_pumps + cost_of_burying;

        if (total_cost < lowest_cost) {
            optimal_percent_bury = percent_bury;
            optimal_number_pumps = number_of_pumps;
            optimal_pipe_diameter = pipe.diameter;
            optimal_EGL = EGL_plot;
            optimal_HGL = HGL_plot;
            lowest_cost = total_cost;
            console.log("===== CURRENT OPTIMAL SOLUTION =====");
            console.log(`Diameter        : ${pipe.diameter.toFixed(6)} m`);
            console.log(
                `Percent Buried  : ${(percent_bury * 100).toFixed(6)} %`
            );
            console.log(`Number of Pumps : ${number_of_pumps}`);
            console.log("");
            console.log("---- Cost Breakdown ----");
            console.log(
                `Pipe Cost       : $${cost_of_piping.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                })}`
            );
            console.log(
                `Burial Cost     : $${cost_of_burying.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 2 }
                )}`
            );
            console.log(
                `Pump Cost       : $${cost_of_pumps.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                })}`
            );
            console.log("--------------------------");
            console.log(
                `Total Cost      : $${total_cost.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                })}`
            );
            console.log("=====================================\n");
            await createChart(d_plot, [
                {
                    label: "EGL",
                    data: optimal_EGL,
                    borderColor: "blue",
                },

                // {
                //     label: "HGL",
                //     data: optimal_HGL,
                //     borderColor: "green",
                // },
            ]);
        }
    }
    diameter = actual_diameter;
}

console.log(
    lowest_cost,
    optimal_percent_bury,
    optimal_number_pumps,
    optimal_pipe_diameter
);
