var d3; // Minor workaround to avoid error messages in editors

let globalData = [];
let allColumns = [];

window.onload = () => {
      // Load your data (using the football.json from your previous query)
      fetch('data/football.json')
          .then(response => response.json())
          .then(json => {
                // Filter out players with missing core stats to avoid NaN errors
                globalData = json.nodes.filter(d => d.mins_played !== undefined);

                // Automatically find all numerical columns (excluding 'id')
                const firstItem = globalData[0];
                allColumns = Object.keys(firstItem).filter(key =>
                    typeof firstItem[key] === "number" && key !== "id"
                );

                // Create Checkboxes
                const controls = d3.select("#controls");
                allColumns.forEach((col, index) => {
                      const label = controls.append("label");
                      label.append("input")
                          .attr("type", "checkbox")
                          .attr("value", col)
                          // By default, let's just check the first 3 or 4 to avoid a massive matrix on load
                          .property("checked", index < 4)
                          .on("change", renderMatrix);

                      label.append("span").text(" " + col);
                });

                // Draw the initial matrix
                renderMatrix();
          })
          .catch(error => console.error("Error loading data:", error));
};

function renderMatrix() {
      // 1. Get currently selected columns from checkboxes
      const columns = [];
      d3.selectAll("#controls input:checked").each(function() {
            columns.push(this.value);
      });

      // Clear the existing chart
      d3.select("#chart").html("");

      if (columns.length < 2) {
            d3.select("#chart").append("p").text("Please select at least 2 variables to build the matrix.");
            return;
      }

      // 2. Setup Dimensions
      const width = 900;
      const padding = 28;
      const size = (width - (columns.length + 1) * padding) / columns.length + padding;

      // 3. Create Scales
      const xScales = columns.map(c => d3.scaleLinear()
          .domain(d3.extent(globalData, d => d[c]))
          .rangeRound([padding / 2, size - padding / 2])
          .nice()
      );

      const yScales = xScales.map(x => x.copy().range([size - padding / 2, padding / 2]));

      // 4. Create SVG
      const svg = d3.select("#chart").append("svg")
          .attr("width", size * columns.length + padding)
          .attr("height", size * columns.length + padding)
          .attr("viewBox", [-padding, 0, width, width]);

      // 5. Draw Axes
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

      // 6. Draw Matrix Cells
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

      // 7. Draw Circles
      cell.each(function([i, j]) {
            d3.select(this).selectAll("circle")
                .data(globalData.filter(d => !isNaN(d[columns[i]]) && !isNaN(d[columns[j]])))
                .join("circle")
                .attr("cx", d => xScales[i](d[columns[i]]))
                .attr("cy", d => yScales[j](d[columns[j]]))
                .attr("r", 3.5)
                .attr("fill", "#2b8cbe")
                .attr("fill-opacity", 0.7);
      });

      // 8. Add Variable Labels on the diagonal
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

      // 9. Add Brushing Behavior
      const brush = d3.brush()
          .extent([[padding / 2, padding / 2], [size - padding / 2, size - padding / 2]])
          .on("start", brushstarted)
          .on("brush", brushed)
          .on("end", brushended);

      cell.call(brush);

      let brushCell;
      const circle = cell.selectAll("circle");

      function brushstarted() {
            if (brushCell !== this) {
                  d3.select(brushCell).call(brush.move, null);
                  brushCell = this;
            }
      }

      function brushed({selection}, [i, j]) {
            if (selection) {
                  const [[x0, y0], [x1, y1]] = selection;
                  circle.classed("hidden", d => {
                        return x0 > xScales[i](d[columns[i]]) ||
                            x1 < xScales[i](d[columns[i]]) ||
                            y0 > yScales[j](d[columns[j]]) ||
                            y1 < yScales[j](d[columns[j]]);
                  });
            }
      }

      function brushended({selection}) {
            if (!selection) {
                  circle.classed("hidden", false);
            }
      }
}