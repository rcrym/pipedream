import { Chart, ChartConfiguration } from 'chart.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import fs from "fs";

const width = 800; // Width of the chart
const height = 600; // Height of the chart

const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

async function createChart(x_data: number[], datasets: ChartConfiguration["data"]["datasets"]) {
  const configuration: ChartConfiguration = {
    type: 'line',
    data: {
      labels: x_data,
      datasets
    },
    options: {
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            color: 'black', // Darken the y-axis tick labels to black
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)', // Lighten the grid lines
          }
        },
        x: {
          type: "linear",
          ticks: {
            stepSize: 10000,
            // sampleSize: 10,
            // autoSkip: false,
            color: 'black', // Darken the x-axis tick labels to black
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)', // Lighten the grid lines
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: 'black', // Darken the legend text to black
          }
        },
        title: {
          display: true,
          text: 'EGL vs. Distance (Single pipe)',
          color: 'black', // Darken the title text to black
          font: {
            size: 24, // Increase title font size
          }
        }
      },
      elements: {
        line: {
          tension: 0 // Disables bezier curves to make lines sharp
        }
      },
      
    }

  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  fs.writeFileSync('./output/Y_X.png', buffer);
}

export default createChart;
