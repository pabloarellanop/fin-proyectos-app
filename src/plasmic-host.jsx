import React from "react";
import ReactDOM from "react-dom/client";
import { PlasmicCanvasHost } from "@plasmicapp/host";
import "./styles.css";

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <PlasmicCanvasHost />
  </React.StrictMode>
);
