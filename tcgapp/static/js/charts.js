/**
 * Price history chart for the card detail page.
 * Reads the global `chartData` variable set by the card_detail template
 * and renders a multi-line Chart.js graph (one line per variant).
 */

(function () {
    "use strict";

    var canvas = document.getElementById("priceChart");
    if (!canvas || typeof chartData === "undefined" || !chartData) {
        return;
    }

    var variants = Object.keys(chartData);
    if (variants.length === 0) {
        return;
    }

    // Color palette for variant lines
    var lineColors = [
        { border: "hsl(270, 100%, 65%)", bg: "hsla(270, 100%, 65%, 0.10)" },  // purple
        { border: "hsl(230, 80%, 60%)",  bg: "hsla(230, 80%, 60%, 0.10)" },   // blue
        { border: "hsl(185, 80%, 55%)",  bg: "hsla(185, 80%, 55%, 0.10)" },   // cyan
        { border: "hsl(142, 76%, 50%)",  bg: "hsla(142, 76%, 50%, 0.10)" },   // green
        { border: "hsl(280, 80%, 55%)",  bg: "hsla(280, 80%, 55%, 0.10)" },   // pink
        { border: "hsl(48, 96%, 53%)",   bg: "hsla(48, 96%, 53%, 0.10)" },    // gold
    ];

    // Build datasets
    var datasets = [];
    for (var i = 0; i < variants.length; i++) {
        var variantName = variants[i];
        var colorIdx = i % lineColors.length;
        var variantData = chartData[variantName];

        datasets.push({
            label: variantName,
            data: variantData.prices,
            borderColor: lineColors[colorIdx].border,
            backgroundColor: lineColors[colorIdx].bg,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: lineColors[colorIdx].border,
            pointBorderColor: "hsl(220, 18%, 10%)",
            pointBorderWidth: 2,
            fill: true,
            tension: 0.3,
            spanGaps: true,
        });
    }

    // Use the date labels from the first variant (they should all share the same dates)
    var labels = chartData[variants[0]].dates;

    var ctx = canvas.getContext("2d");

    new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false,
            },
            plugins: {
                legend: {
                    display: variants.length > 1,
                    position: "top",
                    labels: {
                        color: "hsl(215, 20%, 60%)",
                        font: {
                            family: "Inter, system-ui, sans-serif",
                            size: 12,
                            weight: "500",
                        },
                        padding: 16,
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                tooltip: {
                    backgroundColor: "hsl(220, 18%, 10%)",
                    borderColor: "hsl(220, 15%, 18%)",
                    borderWidth: 1,
                    titleColor: "hsl(210, 40%, 98%)",
                    bodyColor: "hsl(215, 20%, 60%)",
                    titleFont: {
                        family: "Inter, system-ui, sans-serif",
                        size: 13,
                        weight: "600",
                    },
                    bodyFont: {
                        family: "Inter, system-ui, sans-serif",
                        size: 12,
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: true,
                    callbacks: {
                        title: function (items) {
                            if (!items.length) return "";
                            var dateStr = items[0].label;
                            var d = new Date(dateStr + "T00:00:00");
                            return d.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                            });
                        },
                        label: function (item) {
                            var value = item.parsed.y;
                            if (value === null || value === undefined) {
                                return item.dataset.label + ": N/A";
                            }
                            return item.dataset.label + ": $" + value.toFixed(2);
                        },
                    },
                },
            },
            scales: {
                x: {
                    grid: {
                        color: "hsla(220, 15%, 18%, 0.5)",
                        drawBorder: false,
                    },
                    ticks: {
                        color: "hsl(215, 20%, 50%)",
                        font: {
                            family: "Inter, system-ui, sans-serif",
                            size: 11,
                        },
                        maxRotation: 45,
                        callback: function (value, index) {
                            var label = this.getLabelForValue(value);
                            var d = new Date(label + "T00:00:00");
                            return d.toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                            });
                        },
                    },
                },
                y: {
                    grid: {
                        color: "hsla(220, 15%, 18%, 0.5)",
                        drawBorder: false,
                    },
                    ticks: {
                        color: "hsl(215, 20%, 50%)",
                        font: {
                            family: "Inter, system-ui, sans-serif",
                            size: 11,
                        },
                        callback: function (value) {
                            return "$" + value.toFixed(2);
                        },
                    },
                    beginAtZero: false,
                },
            },
        },
    });
})();
