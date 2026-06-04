// Master Dashboard Controller: Dynamic PCP & SPLOM Coordination
let globalData = [];
let allColumns = [];
let pcpPathSelection; // References PCP lines globally for cross-brushing
let splomCircleSelection; // References SPLOM circles globally for cross-brushing

window.onload = () => {
  // Load the shared dataset once
  fetch('data/football.json')
    .then((response) => response.json())
    .then((json) => {
      // Filter data cleanly for both visualizations
      globalData = json.nodes.filter(d => d.appearance !== undefined && d.mins_played !== undefined);

      // Setup Shared Control Checkboxes dynamically based on numerical data columns
      const firstItem = globalData[0];
      allColumns = Object.keys(firstItem).filter(key =>
        typeof firstItem[key] === "number" && key !== "id"
      );

      const controls = d3.select("#controls");
      allColumns.forEach((col, index) => {
        const label = controls.append("label").style("margin-right", "10px");
        label.append("input")
          .attr("type", "checkbox")
          .attr("value", col)
          // Default check the core dimensions, or just the first few
          .property("checked", ["appearance", "mins_played", "ball_recovery", "goals"].includes(col) || (index < 4 && !["appearance", "mins_played", "ball_recovery", "goals"].some(k => allColumns.includes(k))))
          .on("change", updateDashboard); // Trigger master update layout on change
        label.append("span").text(" " + col);
      });

      // Initial execution of both plots
      updateDashboard();
    })
    .catch(error => console.error("Error loading combined dashboard data:", error));
};

// Master layout update function
function updateDashboard() {
  // 1. Fetch the currently active dimensions chosen by the user
  const activeKeys = [];
  d3.selectAll("#controls input:checked").each(function() {
    activeKeys.push(this.value);
  });

  // 2. Render/Update both views with the same dynamic dimensions
  renderPCP(globalData, activeKeys);
  renderSPLOM(globalData, activeKeys);
}

// ==========================================
// 1. DYNAMIC PARALLEL COORDINATES PLOT (PCP)
// ==========================================
function renderPCP(data, keys) {
  // Clear previous execution wrapper container to redraw layout cleanly
  d3.select("#pcp-chart").html("");

  if (keys.length < 2) {
    d3.select("#pcp-chart").append("p").text("Select at least 2 dimensions to render the Parallel Coordinates Plot.");
    return;
  }

  const keyColorAnchor = keys.includes("goals") ? "goals" : keys[0];

  const margin = { top: 50, right: 80, bottom: 40, left: 80 };
  const width = 960 - margin.left - margin.right;
  const height = 500 - margin.top - margin.bottom;

  const svg = d3.select("#pcp-chart")
    .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
    .append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top})`);

  // X scale updates dynamically using the selected checkbox array
  const x = d3.scalePoint().domain(keys).range([0, width]);

  const y = new Map(Array.from(keys, key => [
    key,
    d3.scaleLinear()
      .domain(d3.extent(data, d => +d[key] || 0))
      .range([height, 0])
  ]));

  const color = d3.scaleSequential()
    .domain(d3.extent(data, d => +d[keyColorAnchor] || 0))
    .interpolator(d3.interpolateViridis);

  const line = d3.line()
    .defined(([, value]) => value != null)
    .x(([key]) => x(key))
    .y(([key, value]) => y.get(key)(value));

  pcpPathSelection = svg.append("g")
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.6)
    .selectAll("path")
    .data(data)
    .join("path")
      .attr("stroke", d => color(d[keyColorAnchor] || 0))
      .attr("d", d => line(Array.from(keys, key => [key, d[key]])));

  pcpPathSelection.append("title").text(d => d.label);

  const axes = svg.append("g")
    .selectAll("g")
    .data(keys)
    .join("g")
      .attr("transform", d => `translate(${x(d)}, 0)`)
      .each(function(d) { d3.select(this).call(d3.axisLeft(y.get(d))); });

  axes.append("text")
    .attr("y", -15)
    .attr("text-anchor", "middle")
    .attr("fill", "currentColor")
    .style("font-weight", "bold")
    .text(d => d.replace("_", " ").toUpperCase());

  // Brush logic tracking variables local context
  const deselectedColor = "#ddd";
  const brushWidth = 30;
  const selections = new Map();

  const brush = d3.brushY()
      .extent([[-(brushWidth / 2), 0], [brushWidth / 2, height]])
      .on("start brush end", brushed);

  axes.call(brush);

  function brushed({ selection }, key) {
    if (selection === null) {
      selections.delete(key);
    } else {
      selections.set(key, selection.map(y.get(key).invert));
    }

    const activePlayers = new Set();

    pcpPathSelection.each(function(d) {
      const active = Array.from(selections).every(([k, [max, min]]) => {
        const val = d[k] || 0;
        return val >= min && val <= max;
      });

      d3.select(this)
        .style("stroke", active ? color(d[keyColorAnchor] || 0) : deselectedColor)
        .style("stroke-opacity", active ? 0.8 : 0.15);

      if (active) {
        d3.select(this).raise();
        activePlayers.add(d.id);
      }
    });

    if (splomCircleSelection) {
      splomCircleSelection.each(function(d) {
        if (selections.size === 0) {
          d3.select(this).style("fill", "#2b8cbe").style("fill-opacity", 0.7);
        } else {
          const match = activePlayers.has(d.id);
          d3.select(this)
            .style("fill", match ? "#e41a1c" : "#ccc")
            .style("fill-opacity", match ? 0.9 : 0.1);
          if (match) d3.select(this).raise();
        }
      });
    }
  }
}

// ==========================================
// 2. SCATTERPLOT MATRIX (SPLOM)
// ==========================================
function renderSPLOM(data, columns) {
  d3.select("#matrix-chart").html("");

  if (columns.length < 2) {
        d3.select("#matrix-chart").append("p").text("Select at least 2 dimensions to build the matrix.");
        return;
  }

  const width = 900;
  const padding = 28;
  const size = (width - (columns.length + 1) * padding) / columns.length + padding;

  const xScales = columns.map(c => d3.scaleLinear()
      .domain(d3.extent(data, d => d[c]))
      .rangeRound([padding / 2, size - padding / 2])
      .nice()
  );

  const yScales = xScales.map(x => x.copy().range([size - padding / 2, padding / 2]));

  const svg = d3.select("#matrix-chart").append("svg")
      .attr("width", size * columns.length + padding)
      .attr("height", size * columns.length + padding)
      .attr("viewBox", [-padding, 0, width, width]);

  const xAxis = d3.axisBottom().ticks(6).tickSize(size * columns.length);
  svg.append("g").selectAll("g").data(xScales).join("g")
      .attr("transform", (d, i) => `translate(${i * size},0)`)
      .each(function(d) { d3.select(this).call(xAxis.scale(d)); })
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke", "#ddd"));

  const yAxis = d3.axisLeft().ticks(6).tickSize(-size * columns.length);
  svg.append("g").selectAll("g").data(yScales).join("g")
      .attr("transform", (d, i) => `translate(0,${(columns.length - 1 - i) * size})`)
      .each(function(d) { d3.select(this).call(yAxis.scale(d)); })
      .call(g => g.select(".domain").remove())
      .call(g => g.selectAll(".tick line").attr("stroke", "#ddd"));

  const cell = svg.append("g")
      .selectAll("g")
      .data(d3.cross(d3.range(columns.length), d3.range(columns.length)))
      .join("g")
      .attr("transform", ([i, j]) => `translate(${i * size},${(columns.length - 1 - j) * size})`);

  cell.append("rect")
      .attr("fill", "none")
      .attr("stroke", "#aaa")
      .attr("x", padding / 2 + 0.5)
      .attr("y", padding / 2 + 0.5)
      .attr("width", size - padding)
      .attr("height", size - padding);

  cell.each(function([i, j]) {
        d3.select(this).selectAll("circle")
            .data(data.filter(d => !isNaN(d[columns[i]]) && !isNaN(d[columns[j]])))
            .join("circle")
            .attr("cx", d => xScales[i](d[columns[i]]))
            .attr("cy", d => yScales[j](d[columns[j]]))
            .attr("r", 3.5)
            .attr("fill", "#2b8cbe")
            .attr("fill-opacity", 0.7);
  });

  splomCircleSelection = cell.selectAll("circle");

  svg.append("g")
      .style("font", "bold 10px sans-serif")
      .style("pointer-events", "none")
      .selectAll("text")
      .data(columns)
      .join("text")
      .attr("transform", (d, i) => `translate(${i * size},${(columns.length - 1 - i) * size})`)
      .attr("x", padding)
      .attr("y", padding)
      .attr("dy", ".71em")
      .text(d => d);

  const brush = d3.brush()
      .extent([[padding / 2, padding / 2], [size - padding / 2, size - padding / 2]])
      .on("start", brushstarted)
      .on("brush", brushed)
      .on("end", brushended);

  cell.call(brush);

  let brushCell;

  function brushstarted() {
        if (brushCell !== this) {
              d3.select(brushCell).call(brush.move, null);
              brushCell = this;
        }
  }

  function brushed({selection}, [i, j]) {
        if (selection) {
              const [[x0, y0], [x1, y1]] = selection;

              splomCircleSelection.classed("hidden", d => {
                    return x0 > xScales[i](d[columns[i]]) ||
                        x1 < xScales[i](d[columns[i]]) ||
                        y0 > yScales[j](d[columns[j]]) ||
                        y1 < yScales[j](d[columns[j]]);
              });

              const boundsActiveIds = new Set();
              splomCircleSelection.each(function(d) {
                  const isHidden = x0 > xScales[i](d[columns[i]]) || x1 < xScales[i](d[columns[i]]) || y0 > yScales[j](d[columns[j]]) || y1 < yScales[j](d[columns[j]]);
                  if(!isHidden) boundsActiveIds.add(d.id);
              });

              pcpPathSelection.each(function(d) {
                  const active = boundsActiveIds.has(d.id);
                  d3.select(this)
                    .style("stroke-opacity", active ? 0.9 : 0.05)
                    .style("stroke-width", active ? 2 : 1);
                  if(active) d3.select(this).raise();
              });
        }
  }

  function brushended({selection}) {
        if (!selection) {
              splomCircleSelection.classed("hidden", false);
              pcpPathSelection.style("stroke-opacity", 0.6).style("stroke-width", 1.5);
        }
  }
}