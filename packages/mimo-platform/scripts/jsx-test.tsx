import { jsx } from "hono/jsx";

function App() {
  return <div>Hello from TSX</div>;
}

const result = jsx("div", { children: "Test" });
console.log("JSX works:", typeof result);
