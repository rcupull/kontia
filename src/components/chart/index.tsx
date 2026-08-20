import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";
import {
  Chart as ReactChart,
  type ChartProps as ReactChartProps,
} from "react-chartjs-2";
import "chart.js/auto";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

export type ChartType = ReactChartProps["type"];
export type ChartData = ReactChartProps["data"];
export type ChartOptions = ReactChartProps["options"];

export function Chart({
  type,
  data,
  options,
  height = 300,
  title,
}: {
  type: ChartType;
  data: ChartData;
  options?: ChartOptions;
  height?: number;
  title?: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      {title && (
        <p className="mb-3 text-sm font-black uppercase text-slate-500">
          {title}
        </p>
      )}
      <div className="relative w-full" style={{ height }}>
        <ReactChart
          type={type}
          data={data}
          options={{ responsive: true, maintainAspectRatio: false, ...options }}
        />
      </div>
    </div>
  );
}
