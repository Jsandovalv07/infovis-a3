var d3; // Minor workaround to avoid error messages in editors

// Waiting until document has loaded
window.onload = () => {

  // Loading the dataset
  fetch('data/football.json')
    .then((response) => response.json())
    .then((json) => {
      // The soccer dataset contains players under the "nodes" array
      const data = json.nodes.filter(d => d.appearance !== undefined); 
      
      // Select the vertical axes/metrics you want to compare
      const keys = ["appearance", "mins_played", "ball_recovery", "possession","pass_accurate", "pass_inaccurate", "goals"];
      const keyColorAnchor = "goals"; // Used for line color gradients

      // 1. Chart dimensions configuration
      const margin = { top: 50, right: 80, bottom: 40, left: 80 };
      const width = 960 - margin.left - margin.right;
      const height = 500 - margin.top - margin.bottom;

      // Create the main SVG wrapper inside your visualization area
      // (Using body as a generic fallback, adjust selection if you have a specific div id)
      const svg = d3.select("body")
        .append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
        .append("g")
          .attr("transform", `translate(${margin.left}, ${margin.top})`);

      // 2. Transpose layout: Switch axes direction to vertical
      // Horizontal scale determines which metric axis goes where left-to-right
      const x = d3.scalePoint()
        .domain(keys)
        .range([0, width]);

      // Vertical scale map: creates a separate vertical linear scale for each axis metric
      const y = new Map(Array.from(keys, key => [
        key,
        d3.scaleLinear()
          .domain(d3.extent(data, d => +d[key] || 0))
          .range([height, 0]) // 0 (max value) at the top, height (min value) at the bottom
      ]));

      // Sequential color scale mapping the active metric property
      const color = d3.scaleSequential()
        .domain(d3.extent(data, d => +d[keyColorAnchor] || 0))
        .interpolator(d3.interpolateViridis);

      // Line path string generator function mapping player variables to (x, y) coordinates
      const line = d3.line()
        .defined(([, value]) => value != null)
        .x(([key]) => x(key))
        .y(([key, value]) => y.get(key)(value));

      // Append parallel lines representing each player
      const path = svg.append("g")
          .attr("fill", "none")
          .attr("stroke-width", 1.5)
          .attr("stroke-opacity", 0.6)
        .selectAll("path")
        .data(data)
        .join("path")
          .attr("stroke", d => color(d[keyColorAnchor] || 0))
          .attr("d", d => line(Array.from(keys, key => [key, d[key]])))
        .call(p => p.append("title")
          .text(d => d.label));

      // Append the vertical axis containers
      const axes = svg.append("g")
        .selectAll("g")
        .data(keys)
        .join("g")
          .attr("transform", d => `translate(${x(d)}, 0)`)
          .each(function(d) { 
            // Binds vertical axis labels
            d3.select(this).call(d3.axisLeft(y.get(d))); 
          });

      // Add axis column headers at the top edge
      axes.append("text")
        .attr("y", -15)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .style("font-weight", "bold")
        .text(d => d.replace("_", " ").toUpperCase());

      // 3. Vertical brushing implementation
      const deselectedColor = "#ddd";
      const brushWidth = 30;
      const selections = new Map();

      const brush = d3.brushY()
          .extent([
            [-(brushWidth / 2), 0],
            [brushWidth / 2, height]
          ])
          .on("start brush end", brushed);

      axes.call(brush);

      function brushed({ selection }, key) {
        if (selection === null) {
          selections.delete(key);
        } else {
          // Converts selection box pixel values back to domain value arrays
          selections.set(key, selection.map(y.get(key).invert));
        }

        // Iterates through all drawn pathways to verify active brushes across axes
        path.each(function(d) {
          const active = Array.from(selections).every(([k, [max, min]]) => {
            // Because y-scales are inverted spatially, the upper pixel index (min) 
            // evaluates to the larger domain value (max), so we bounds-check accordingly.
            const val = d[k] || 0;
            return val >= min && val <= max;
          });

          d3.select(this)
            .style("stroke", active ? color(d[keyColorAnchor] || 0) : deselectedColor)
            .style("stroke-opacity", active ? 0.8 : 0.15);

          if (active) d3.select(this).raise();
        });
      }
    });
};
