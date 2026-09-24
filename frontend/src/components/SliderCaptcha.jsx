import { useState, useRef, useEffect } from "react";

/**
 * Slider CAPTCHA: puzzle UI that records drag position and (x, y, t) trajectory
 * for backend verification. Backend checks position accuracy and human-like movement.
 */
const SliderCaptcha = ({ onVerify, onFail, challenge }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(0);
  const [trajectory, setTrajectory] = useState([]);
  const trackRef = useRef(null);
  const startTimeRef = useRef(null);

  /** Start drag: record first point of trajectory. */
  const handleMouseDown = (e) => {
    setIsDragging(true);
    startTimeRef.current = Date.now();
    setTrajectory([
      {
        x: e.clientX,
        y: e.clientY,
        t: Date.now(),
      },
    ]);
  };

  /** While dragging: append (x, y, t) to trajectory and update slider position from track bounds. */
  const handleMouseMove = (e) => {
    if (!isDragging || !trackRef.current) return;

    const newPoint = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
    };
    setTrajectory((prev) => [...prev, newPoint]);

    const rect = trackRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;

    let percentage = (x / width) * 100;
    percentage = Math.max(0, Math.min(100, percentage));

    setSliderPosition(percentage);
  };

  /** End drag: call onVerify with final offset and full trajectory for backend. */
  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (onVerify) {
      onVerify({
        offset: sliderPosition,
        trajectory: trajectory,
      });
    }
  };

  /** Global listeners so drag continues when mouse leaves the track. */
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        handleMouseMove(e);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMouseMove);
      window.addEventListener("mouseup", handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMouseMove);
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [isDragging, sliderPosition, trajectory]);

  return (
    <div className="slider-captcha-container">
      <div className="slider-instructions">Slide to complete the puzzle</div>

      <div className="slider-puzzle-area">
        <div className="slider-puzzle-bg"></div>
        <div
          className="slider-puzzle-piece"
          style={{ left: `${sliderPosition}%` }}
        ></div>
        <div
          className="slider-target-hole"
          style={{ left: `${challenge?.target || 50}%` }}
        ></div>
      </div>

      <div className="slider-track-container" ref={trackRef}>
        <div className="slider-track-bg"></div>
        <div
          className="slider-handle"
          style={{ left: `${sliderPosition}%` }}
          onMouseDown={handleMouseDown}
        >
          <span className="slider-arrow">→</span>
        </div>
        <div
          className="slider-track-fill"
          style={{ width: `${sliderPosition}%` }}
        ></div>
      </div>

      <div className="slider-footer">
        {isDragging ? "Keep sliding..." : "Drag the slider"}
      </div>
    </div>
  );
};

export default SliderCaptcha;
