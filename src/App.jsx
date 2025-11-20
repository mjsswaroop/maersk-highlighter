import React, { useEffect, useRef, useState } from "react";

// ✅ Correct imports for Vite
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const PDF_URL = "/Maersk Q2 2025 Interim Report (1).pdf";

// Citation mappings - text to highlight for each citation
const CITATIONS = {
  1: "EBITDA increase",
  2: "EBITDA margin",
  3: "Gain",
};

export default function App() {
  const containerRef = useRef(null);
  const [pageViews, setPageViews] = useState([]);
  const [highlight, setHighlight] = useState(null);

  // ------------------------------------------------------
  // LOAD PDF
  // ------------------------------------------------------
  useEffect(() => {
    const loadingTask = pdfjsLib.getDocument(PDF_URL);

    loadingTask.promise
      .then(async (pdf) => {
        const pages = [];

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);

          const scale = 1.4;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = viewport.width + "px";
          canvas.style.height = viewport.height + "px";

          await page.render({ canvasContext: ctx, viewport }).promise;

          // Extract text items
          const textContent = await page.getTextContent();
          const textItems = textContent.items.map((item) => {
            const [a, b, c, d, e, f] = item.transform;

            const fontHeight = Math.hypot(b, d) || 10;

            const { x, y } = viewport.convertToViewportPoint
              ? { x: viewport.convertToViewportPoint(e, f)[0], y: viewport.convertToViewportPoint(e, f)[1] }
              : { x: e * viewport.scale, y: f * viewport.scale };

            const width = (item.width || 40) * viewport.scale;

            return {
              str: item.str,
              bbox: {
                left: x,
                top: y,
                width,
                height: fontHeight * viewport.scale,
              },
            };
          });

          pages.push({ canvas, viewport, textItems });
        }

        setPageViews(pages);
      })
      .catch((err) => console.error("PDF FAILED:", err));
  }, []);

  // ------------------------------------------------------
  // RENDER PDF CANVASES
  // ------------------------------------------------------
  useEffect(() => {
    const left = containerRef.current?.querySelector(".pdf-left");
    if (!left) return;

    left.innerHTML = "";

    pageViews.forEach((pv, idx) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrapper";
      wrapper.style.position = "relative";

      wrapper.appendChild(pv.canvas);

      const overlays = document.createElement("div");
      overlays.className = "page-overlays";
      overlays.style.position = "absolute";
      overlays.style.left = "0";
      overlays.style.top = "0";
      overlays.style.width = pv.canvas.style.width;
      overlays.style.height = pv.canvas.style.height;

      overlays.dataset.pageIndex = idx;

      wrapper.appendChild(overlays);
      left.appendChild(wrapper);
    });
  }, [pageViews]);

  // ------------------------------------------------------
  // DRAW HIGHLIGHT
  // ------------------------------------------------------
  useEffect(() => {
    const left = containerRef.current?.querySelector(".pdf-left");
    if (!left || highlight == null) return;

    left.querySelectorAll(".highlight-rect").forEach((el) => el.remove());

    const wrapper = left.querySelectorAll(".pdf-page-wrapper")[highlight.pageIndex];
    if (!wrapper) return;

    const overlays = wrapper.querySelector(".page-overlays");

    const rect = document.createElement("div");
    rect.className = "highlight-rect";
    rect.style.position = "absolute";
    rect.style.left = highlight.rect.left + "px";
    rect.style.top = highlight.rect.top + "px";
    rect.style.width = highlight.rect.width + "px";
    rect.style.height = highlight.rect.height + "px";
    rect.style.background = "rgba(255, 255, 0, 0.4)";
    rect.style.pointerEvents = "none";

    overlays.appendChild(rect);
    wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlight]);

  // ------------------------------------------------------
  // HIGHLIGHT TEXT BY CITATION NUMBER
  // ------------------------------------------------------
  const highlightByCitation = (citationNum) => {
    const targetText = CITATIONS[citationNum];
    if (!targetText) {
      alert("Citation not found!");
      return;
    }
    
    const target = targetText.toLowerCase();

    for (let pageIndex = 0; pageIndex < pageViews.length; pageIndex++) {
      const pv = pageViews[pageIndex];

      // Build full text from all items on this page
      const fullText = pv.textItems.map((ti) => ti.str).join(" ").toLowerCase();
      
      // Check if target exists on this page
      if (!fullText.includes(target)) continue;

      // Try to find the target text by building sequences
      for (let i = 0; i < pv.textItems.length; i++) {
        let seq = "";
        let left = Infinity,
          top = Infinity,
          right = -Infinity,
          bottom = -Infinity;
        
        let matchedItems = [];

        for (let j = i; j < pv.textItems.length; j++) {
          const item = pv.textItems[j];
          
          // Add to sequence
          if (seq) seq += " ";
          seq += item.str.toLowerCase();
          matchedItems.push(item);

          // Update bounding box
          const b = item.bbox;
          left = Math.min(left, b.left);
          top = Math.min(top, b.top);
          right = Math.max(right, b.left + b.width);
          bottom = Math.max(bottom, b.top + b.height);

          // Check if we found the target
          // if (seq.includes(target)) {
          //   setHighlight({
          //     pageIndex,
          //     rect: {
          //       left,
          //       top,
          //       width: right - left,
          //       height: bottom - top,
          //     },
          //   });
          //   return;
          // }
          if (seq.includes(target)) {
    // Split into words to locate exact match position
    const seqLower = seq.toLowerCase().split(" ");
    const targetWords = target.split(" ");

    // Find start index inside the sequence
    const startIdx = seqLower.join(" ").indexOf(target);
    if (startIdx === -1) continue;

    // Collect only the boxes for matching words
    const matchBoxes = [];
    let combined = "";
    for (let k = 0; k < matchedItems.length; k++) {
        combined += (combined ? " " : "") + matchedItems[k].str.toLowerCase();
        if (combined.includes(target)) {
            matchBoxes.push(matchedItems[k].bbox);
        }
    }

    if (matchBoxes.length === 0) continue;

    // Build tight bounding box ONLY from matched words
    let left = Math.min(...matchBoxes.map((b) => b.left));
    let top = Math.min(...matchBoxes.map((b) => b.top));
    let right = Math.max(...matchBoxes.map((b) => b.left + b.width));
    let bottom = Math.max(...matchBoxes.map((b) => b.top + b.height));

    setHighlight({
        pageIndex,
        rect: {
            left,
            top,
            width: right - left,
            height: bottom - top,
        },
    });

    return;
}

          
          // Stop if sequence is getting too long (optimization)
          if (matchedItems.length > 15) break;
        }
      }
    }

    alert(`Text "${targetText}" not found in PDF!`);
  };

  return (
    <div className="app-root" ref={containerRef}>
      <div className="toolbar">
        <h2>Maersk Q2 Report Highlighter</h2>
      </div>

      <div className="content">
        {/* LEFT: PDF */}
        <div className="pdf-left" />

        {/* RIGHT: Full Analysis */}
        <div className="text-right">
          <div className="analysis-box">
            <h3>Analysis</h3>
            <p>
              No extraordinary or one-off items affecting EBITDA were reported in Maersk's Q2 2025 results. 
              The report explicitly notes that EBITDA improvements stemmed from operational performance— 
              including volume growth, cost control, and margin improvement across Ocean, Logistics & Services, 
              and Terminals segments{" "}
              <button className="citation-link" onClick={() => highlightByCitation(1)}>[1]</button>
              <button className="citation-link" onClick={() => highlightByCitation(2)}>[2]</button>.
            </p>
            
            <p>
              Gains or losses from asset sales, which could qualify as extraordinary items, are shown 
              separately under EBIT and not included in EBITDA. The gain on sale of non-current assets 
              was USD 25 m in Q2 2025, significantly lower than USD 208 m in Q2 2024, but these affect 
              EBIT, not EBITDA{" "}
              <button className="citation-link" onClick={() => highlightByCitation(3)}>[3]</button>.
            </p>
            
            <p>
              Hence, Q2 2025 EBITDA reflects core operating activities without one-off extraordinary adjustments.
            </p>

            <h3 style={{ marginTop: '1.5rem' }}>Findings</h3>
            
            <div className="finding">
              <h4>Page 3 — Highlights</h4>
              <p>
                Q2 2025 EBITDA increase (USD 2.3 bn vs USD 2.1 bn prior year) attributed to operational 
                improvements; no mention of extraordinary or one-off items.{" "}
                <button className="citation-link" onClick={() => highlightByCitation(1)}>[1]</button>
              </p>
            </div>

            <div className="finding">
              <h4>Page 5 — Review</h4>
              <p>
                Q2 2025 EBITDA rise driven by higher revenue and cost control across all segments; 
                no extraordinary gains or losses included.{" "}
                <button className="citation-link" onClick={() => highlightByCitation(2)}>[2]</button>
              </p>
            </div>

            <div className="finding">
              <h4>Page 15 — Condensed Income Statement</h4>
              <p>
                Gain on sale of non-current assets USD 25 m (vs USD 208 m prior year) reported separately 
                below EBITDA; therefore, not part of EBITDA.{" "}
                <button className="citation-link" onClick={() => highlightByCitation(3)}>[3]</button>
              </p>
            </div>

            <h3 style={{ marginTop: '1.5rem' }}>Supporting Evidence</h3>
            
            <div className="evidence">
              <p>
                <button className="citation-link" onClick={() => highlightByCitation(1)}>[1]</button>{" "}
                <strong>A.P. Moller – Maersk Q2 2025 Interim Report (7 Aug 2025) — Page 3</strong>
                <br />
                "Maersk's results continued to improve year-on-year … EBITDA of USD 2.3 bn (USD 2.1 bn) … 
                driven by volume and other revenue growth in Ocean, margin improvements in Logistics & Services 
                and significant top line growth in Terminals."
              </p>
            </div>

            <div className="evidence">
              <p>
                <button className="citation-link" onClick={() => highlightByCitation(2)}>[2]</button>{" "}
                <strong>A.P. Moller – Maersk Q2 2025 Interim Report (7 Aug 2025) — Page 5</strong>
                <br />
                "EBITDA increased to USD 2.3 bn (USD 2.1 bn) … driven by higher revenue and cost management … 
                Ocean's EBITDA … slightly increased by USD 36 m … Logistics & Services contributed significantly 
                with a USD 71 m increase … Terminals' EBITDA increased by USD 50 m."
              </p>
            </div>

            <div className="evidence">
              <p>
                <button className="citation-link" onClick={() => highlightByCitation(3)}>[3]</button>{" "}
                <strong>A.P. Moller – Maersk Q2 2025 Interim Report (7 Aug 2025) — Page 15</strong>
                <br />
                "Gain on sale of non-current assets, etc., net 25 (208) … Profit before depreciation, 
                amortisation and impairment losses, etc. (EBITDA) 2,298"
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        .app-root {
          display: flex;
          flex-direction: column;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .toolbar {
          background: #1f2937;
          color: white;
          padding: 1rem 2rem;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .toolbar h2 {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
        }

        .content {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        .pdf-left {
          flex: 1;
          overflow-y: auto;
          background: #e5e7eb;
          padding: 2rem;
          width: 75%;
        }

        .pdf-page-wrapper {
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          background: white;
        }

        .text-right {
          flex: 0 0 25%;
          min-width: 300px;
          padding: 2rem;
          overflow-y: auto;
          background: #f9fafb;
        }

        .analysis-box {
          max-width: 100%;
          line-height: 1.6;
          font-size: 0.9rem;
        }

        .analysis-box h3 {
          color: #1f2937;
          margin-bottom: 0.75rem;
          font-size: 1.2rem;
        }

        .analysis-box h4 {
          color: #374151;
          margin-bottom: 0.5rem;
          font-size: 0.95rem;
        }

        .analysis-box p {
          margin-bottom: 0.75rem;
          color: #4b5563;
          font-size: 0.85rem;
        }

        .citation-link {
          background: none;
          border: none;
          color: #2563eb;
          cursor: pointer;
          padding: 0;
          font-size: inherit;
          text-decoration: none;
          font-weight: 600;
        }

        .citation-link:hover {
          text-decoration: underline;
          color: #1d4ed8;
        }

        .finding,
        .evidence {
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: white;
          border-radius: 6px;
          border-left: 3px solid #3b82f6;
        }

        .finding h4 {
          margin-top: 0;
          color: #1f2937;
        }

        .evidence p {
          margin: 0;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}