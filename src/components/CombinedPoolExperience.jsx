import { useEffect, useRef } from "react";
import { useRive } from "@rive-app/react-webgl2";
import p5 from "p5";
import Matter from "matter-js";

const BALL_KEYS = [
  "cue", "1", "2", "3", "4", "5", "6", "7",
  "8", "9", "10", "11", "12", "13", "14", "15",
];
const BALL_RADIUS = 18;
const RIVE_WIDTH = 1280;
const RIVE_HEIGHT = 832;

// Map Rive coordinate to p5 canvas coordinate
const riveToP5 = (x, y, canvasWidth, canvasHeight) => {
  return {
    x: (x / RIVE_WIDTH) * canvasWidth,
    y: (y / RIVE_HEIGHT) * canvasHeight,
  };
};

// Map p5 canvas coordinate to Rive coordinate
const p5ToRive = (x, y, canvasWidth, canvasHeight) => {
  return {
    x: (x / canvasWidth) * RIVE_WIDTH,
    y: (y / canvasHeight) * RIVE_HEIGHT,
  };
};

const CombinedPoolExperience = () => {
  const p5ContainerRef = useRef(null);
  const ballPositionsRef = useRef({});
  const rivePropsRef = useRef({});
  const physicsBodiesRef = useRef({});
  const cueHoverInputRef = useRef(null);
  const engineRef = useRef(null);
  const sunkBallsRef = useRef([]);
  const sunkTargetsRef = useRef({}); // key: { x, y }

  const { rive, RiveComponent } = useRive({
    src: "/pool-table.riv",
    stateMachines: ["BallPositions", "CueStick", "8BallModal"],
    autoplay: true,
    autoBind: true,
    enablePointerEvents: true,
  });


  useEffect(() => {
    if (!rive || !rive.readyForPlaying) return;

    const vmi = rive.viewModelInstance;
    if (!vmi) return;

    // CUE STICK 
    const cueStickInputs = rive.stateMachineInputs("CueStick");
    if (!cueStickInputs) {
      return;
    }
    const hoverInput = cueStickInputs.find(input => input.name === "CueHover");
    const cueTrigger = cueStickInputs.find(input => input.name === "CueStickVisibility");


    const BOOLEAN_TYPE = 59;
    const TRIGGER_TYPE = 58;


    //8-BALL MODAL INITIATION
    const modalInputs = rive?.stateMachineInputs("8BallModal");

    //8BallModal test:
    //const modalTriggerInput = modalInputs?.find(i => i.name === "8BallModalVisible");
    //modalTriggerInput.value = true; // Should open modal
    //

    // Cache mutable number props for each ball's X and Y
    const props = {};
    BALL_KEYS.forEach((key) => {
      const prefix = key === "cue" ? "CueBall" : `${key}Ball`;
      const xProp = vmi.number(`${prefix}X`);
      const yProp = vmi.number(`${prefix}Y`);
      if (xProp && yProp) {
        props[`${prefix}X`] = xProp;
        props[`${prefix}Y`] = yProp;
      }
    });
    rivePropsRef.current = props;
  }, [rive]);


  const initialBallPositions = useRef({});

  useEffect(() => {
    const bodies = physicsBodiesRef.current;
    if (!bodies || Object.keys(initialBallPositions.current).length > 0) return;
  
    Object.entries(bodies).forEach(([key, body]) => {
      initialBallPositions.current[key] = { ...body.position };
    });
  }, []);

  useEffect(() => {
    if (!rive || !rive.readyForPlaying) return;

    // p5 sketch definition
    const sketch = (p) => {
      let engine, world;
      let balls = {};
      let walls = [];
      let aiming = false;
      let aimStart = null;


      const TABLE_BOUNDS = {
        xMin: -440,
        xMax: 140,
        yMin: -158,
        yMax: 104,
      };

      const POCKET_MARGIN = 30;
      const pocketPositions = [
        { x: -440, y: -165 }, // Top Left
        { x: -150, y: -165 }, // Top Middle
        { x: 140, y: -165 },  // Top Right
        { x: -440, y: 115 },   // Bottom Left
        { x: -150, y: 115 },   // Bottom Middle
        { x: 140, y: 115 }     // Bottom Right
      ];

      function resetGame() {
        window.location.reload();
      }

      p.setup = () => {
        const w = p5ContainerRef.current.offsetWidth;
        const h = p5ContainerRef.current.offsetHeight;
        p.createCanvas(w, h);
        p.pixelDensity(1);

        engine = Matter.Engine.create();
        engineRef.current = engine;
        world = engine.world;
        engine.world.gravity.y = 0;


        const props = rivePropsRef.current;
        BALL_KEYS.forEach((key) => {
          const prefix = key === "cue" ? "CueBall" : `${key}Ball`;
          const xProp = props[`${prefix}X`];
          const yProp = props[`${prefix}Y`];
          let startX = RIVE_WIDTH / 2;
          let startY = RIVE_HEIGHT / 2;
          if (xProp && yProp) {
            startX = xProp.value;
            startY = yProp.value;
          }
          const pos = riveToP5(startX, startY, p.width, p.height);
          balls[key] = Matter.Bodies.circle(pos.x, pos.y, BALL_RADIUS, {
            restitution: 0.9,
            friction: 0.005,
            frictionAir: 0.04,
            label: key,
          });
        });

        Matter.World.add(world, Object.values(balls));
        physicsBodiesRef.current = balls;
        Object.entries(balls).forEach(([key, body]) => {
          initialBallPositions.current[key] = { ...body.position };
        });


        const wallThickness = 20;
        walls = [
          Matter.Bodies.rectangle((TABLE_BOUNDS.xMin + TABLE_BOUNDS.xMax) / 2, TABLE_BOUNDS.yMin - wallThickness / 2, TABLE_BOUNDS.xMax - TABLE_BOUNDS.xMin, wallThickness, { isStatic: true, restitution: 0.9 }),
          Matter.Bodies.rectangle((TABLE_BOUNDS.xMin + TABLE_BOUNDS.xMax) / 2, TABLE_BOUNDS.yMax + wallThickness / 2, TABLE_BOUNDS.xMax - TABLE_BOUNDS.xMin, wallThickness, { isStatic: true, restitution: 0.9 }),
          Matter.Bodies.rectangle(TABLE_BOUNDS.xMin - wallThickness / 2, (TABLE_BOUNDS.yMin + TABLE_BOUNDS.yMax) / 2, wallThickness, TABLE_BOUNDS.yMax - TABLE_BOUNDS.yMin, { isStatic: true, restitution: 0.9 }),
          Matter.Bodies.rectangle(TABLE_BOUNDS.xMax + wallThickness / 2, (TABLE_BOUNDS.yMin + TABLE_BOUNDS.yMax) / 2, wallThickness, TABLE_BOUNDS.yMax - TABLE_BOUNDS.yMin, { isStatic: true, restitution: 0.9 }),
        ];

        Matter.World.add(world, walls);

      };



      let POCKET_HITBOX_RADIUS = 40; // Used in physics pocket detection
      let POCKET_RADIUS = 35; // Used in p5 visual circles
      let showModal = false; // UI trigger flag
      let scaleFactor = 1.1;


      function isMouseInRect(button) {
        const screenX = p.width / 2 + button.x;
        const screenY = p.height / 2 + button.y;
        return (
          p.mouseX >= screenX &&
          p.mouseX <= screenX + button.w &&
          p.mouseY >= screenY &&
          p.mouseY <= screenY + button.h
        );
      }

      let restartButton = {
        x: -390,
        y: 0,
        w: 200,
        h: 43,
      };

      let continueButton = {
        x: -168,
        y: 0,
        w: 200,
        h: 43,
      };

      const rerackButton = {
        x: 300, 
        y: 245,
        w: 120,
        h: 60,
      };

      p.draw = () => {
        if (!engine) return;

        p.clear();
        Matter.Engine.update(engine);

        p.push();
        p.translate(p.width / 2, p.height / 2 + 8);
        p.scale(scaleFactor);



        const sunkBalls = sunkBallsRef.current;
        const sunkTargets = sunkTargetsRef.current;

        // Optional: Pocket Visual Debug
        const showPocketVisuals = false;
        if (showPocketVisuals) {
          p.fill(0);
          p.noStroke();
          pocketPositions.forEach((pos) => {
            const translated = riveToP5(pos.x, pos.y, p.width, p.height);
            p.circle(translated.x, translated.y, POCKET_RADIUS * 2);
          });
        }
        p.pop();

        Object.entries(physicsBodiesRef.current).forEach(([key, body]) => {
          const { x, y } = body.position;
          const r = BALL_RADIUS;
          const angle = body.angle;
          const drawX = x + p.width / 2 - 15;
          const drawY = y + p.height / 2 + 3;

          p.push();
          p.translate(drawX, drawY);
          p.rotate(angle);
          p.pop();


          // Pocket detection
          for (const pocket of pocketPositions) {
            const dx = x - pocket.x;
            const dy = y - pocket.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < POCKET_HITBOX_RADIUS * POCKET_HITBOX_RADIUS) {
              if (key === "cue") {
                Matter.Body.setPosition(body, { x: 0, y: 0 });
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
              } else if (!sunkBalls.includes(key)) {
                const index = sunkBalls.length;
                const spacing = 50;
                const startX = -150;
                const stackX = startX + index * spacing;
                const stackY = 320;

                sunkTargets[key] = { x: stackX, y: stackY };
                sunkBalls.push(key);

                Matter.Body.setPosition(body, { x: stackX, y: stackY });
                Matter.Body.setVelocity(body, { x: 0, y: 0 });
                Matter.Body.setStatic(body, true);



                //8-BALL MODAL
                if (key === "8") {
                  const modalInputs = rive?.stateMachineInputs("8BallModal");
                  const modalTriggerInput = modalInputs?.find(
                    (input) => input.name === "8BallModalVisible"
                  );
                  if (modalTriggerInput) {
                    modalTriggerInput.value = true;
                    showModal = true;
                    console.log("🎱 8-Ball pocketed — modal triggered!");
                  } else {
                    console.warn("Modal trigger not found!");
                  }
                }
              }

              break; // only break if a pocket was actually hit
            }
          }


          // Align sunk balls to tray
          sunkBalls.forEach((key, index) => {
            const ball = balls[key];
            const spacing = 50;
            const trayY = 275;
            const trayX = -500 + index * spacing;
            Matter.Body.setPosition(ball, { x: trayX, y: trayY });
            Matter.Body.setVelocity(ball, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(ball, 0);
          });

          // Clamp collisions to table bounds
          if (x < TABLE_BOUNDS.xMin + r && body.velocity.x < 0)
            Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
          if (x > TABLE_BOUNDS.xMax - r && body.velocity.x > 0)
            Matter.Body.setVelocity(body, { x: 0, y: body.velocity.y });
          if (y < TABLE_BOUNDS.yMin + r && body.velocity.y < 0)
            Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
          if (y > TABLE_BOUNDS.yMax - r && body.velocity.y > 0)
            Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });

          ballPositionsRef.current[key] = { x, y };

          // Draw tray
          p.push();
          p.translate(p.width / 2, p.height / 2);
          p.noFill();
          p.stroke(255);
          p.strokeWeight(4);
          p.rect(-550, 245, 15 * 52, 60, 20); // Tray size
          p.pop();

          // Draw 8Ball Modal
          if (showModal) {
            p.push();
            p.translate(p.width / 2, p.height / 2);
            p.noFill();
            p.noStroke();
            p.strokeWeight(2);
            p.rect(continueButton.x, continueButton.y, continueButton.w, continueButton.h, 15);
            p.rect(restartButton.x, restartButton.y, restartButton.w, restartButton.h, 15);
            p.pop();
          }

          // Draw rerack button
          p.push();
          p.translate(p.width / 2, p.height / 2);
          p.stroke(255);
          p.strokeWeight(2);
          p.noFill();
          if (isMouseInRect(rerackButton)) {
            p.fill(173, 216, 230, 10);
          }
          p.rect(rerackButton.x, rerackButton.y, rerackButton.w, rerackButton.h, 12); // Rounded corners

          // Button text
          p.noStroke();
          p.fill(255);
          p.textAlign(p.CENTER, p.CENTER);
          p.textFont("sans-serif");
          p.textSize(18);
          p.text("RERACK", rerackButton.x + rerackButton.w / 2, rerackButton.y + rerackButton.h / 2);
          p.pop();

        });


        // Optional Ball Visual Aid
        // p.fill(255, 0, 0, 127);
        // p.noStroke();
        // p.circle(drawX, drawY, BALL_RADIUS * 2);


        //DEBUGGING VISUALS - MOUSE FOLLOW      
       // p.fill(0, 255, 0);
       // p.noStroke();
       // p.ellipse(p.mouseX, p.mouseY, 10, 10);


        // Draw Aim line
        if (aiming && aimStart) {
          const cue = physicsBodiesRef.current.cue;
          const offsetX = p.width / 2 - 15;
          const offsetY = p.height / 2 + 3;
          p.stroke(255, 0, 0);
          p.strokeWeight(2);
          p.line(
            cue.position.x + offsetX,
            cue.position.y + offsetY,
            p.mouseX,
            p.mouseY
          );
        }

      };


      function rerackBalls() {
        const bodies = physicsBodiesRef.current;
        const sunkBalls = sunkBallsRef.current;
        const sunkTargets = sunkTargetsRef.current;
      
        // Clear sunk balls and targets when reracking
        sunkBalls.length = 0;
        for (const key in sunkTargets) {
          delete sunkTargets[key];
        }
      
        Object.entries(initialBallPositions.current).forEach(([key, pos]) => {
          const body = bodies[key];
          Matter.Body.setPosition(body, pos);
          Matter.Body.setVelocity(body, { x: 0, y: 0 });
          Matter.Body.setAngle(body, 0);
          Matter.Body.setAngularVelocity(body, 0);
          Matter.Body.setStatic(body, false);
        });
    
        
      }




      
      p.mouseMoved = () => {
        if (!showModal) return;

        const modalInputs = rive?.stateMachineInputs("8BallModal");
        if (!modalInputs) return;

        const continueHover = modalInputs.find(i => i.name === "ContinueHover");
        const restartHover = modalInputs.find(i => i.name === "RestartHover");

        if (continueHover) continueHover.value = isMouseInRect(continueButton);
        if (restartHover) restartHover.value = isMouseInRect(restartButton);

        function isMouseInRect(rect) {
          const mx = p.mouseX - p.width / 2;
          const my = p.mouseY - p.height / 2;
          return (
            mx >= rect.x &&
            mx <= rect.x + rect.w &&
            my >= rect.y &&
            my <= rect.y + rect.h
          );
        }
      };


      p.mouseClicked = () => {
        if (!showModal) return;

        const modalInputs = rive?.stateMachineInputs("8BallModal");
        if (!modalInputs) return;

        const modalVisible = modalInputs.find(i => i.name === "8BallModalVisible");
        const continueHover = modalInputs.find(i => i.name === "ContinueHover");
        const restartHover = modalInputs.find(i => i.name === "RestartHover");

        if (isMouseInRect(continueButton)) {
          if (modalVisible) {
            modalVisible.value = false;
          }
          showModal = false;
          if (continueHover) continueHover.value = false;
          if (restartHover) restartHover.value = false;
        }

        if (isMouseInRect(restartButton)) {
          if (modalVisible) modalVisible.value = false;
          showModal = false;
          if (continueHover) continueHover.value = false;
          if (restartHover) restartHover.value = false;
          resetGame();
        }
      };



      p.mousePressed = () => {
        const cue = physicsBodiesRef.current.cue;
        if (!cue) return;

        const offsetX = p.width / 2;
        const offsetY = p.height / 2;
        const d = p.dist(p.mouseX, p.mouseY, cue.position.x + offsetX, cue.position.y + offsetY);
        if (d < BALL_RADIUS * 1.5) {
          const cueTrigger = rive?.stateMachineInputs("CueStick")?.find(i => i.name === "CueStickVisibility");
          if (cueTrigger?.fire) cueTrigger.fire();
          aiming = true;
          aimStart = { x: p.mouseX, y: p.mouseY };
          Matter.Body.setVelocity(cue, { x: 0, y: 0 });
        }

        if (isMouseInRect(rerackButton)) {
          rerackBalls();
        }
      };


      p.mouseReleased = () => {
        const offsetX = p.width / 2;
        const offsetY = p.height / 2;


        if (aiming && aimStart) {
          const cue = physicsBodiesRef.current.cue;
          const dx = aimStart.x - p.mouseX;
          const dy = aimStart.y - p.mouseY;
          const forceScale = 0.0003;
          Matter.Body.applyForce(cue, cue.position, { x: dx * forceScale, y: dy * forceScale });

          aiming = false;
          aimStart = null;
        }
      };

      p.windowResized = () => {
        const w = p5ContainerRef.current.offsetWidth;
        const h = p5ContainerRef.current.offsetHeight;
        p.resizeCanvas(w, h);
        p.pixelDensity(1);
      };
    };

    // Initialize p5 sketch
    const myP5 = new p5(sketch, p5ContainerRef.current);

    return () => myP5.remove();
  }, [rive]);

  // Push p5 physics ball positions back into Rive props every animation frame
  useEffect(() => {
    if (!rive || !rive.readyForPlaying) return;

    const updateRivePositions = () => {
      const props = rivePropsRef.current;
      const bodies = physicsBodiesRef.current;
      if (!bodies) return;

      Object.entries(bodies).forEach(([key, body]) => {
        const prefix = key === "cue" ? "CueBall" : `${key}Ball`;
        const xProp = props[`${prefix}X`];
        const yProp = props[`${prefix}Y`];

        const canvas = document.querySelector('canvas'); 
        const { width, height } = canvas;
        const { x, y } = p5ToRive(body.position.x, body.position.y, width, height);

        
        if (xProp && yProp) {
          xProp.value = x;
          yProp.value = y;
        }
      });

      requestAnimationFrame(updateRivePositions);
    };

    requestAnimationFrame(updateRivePositions);

  }, [rive]);

  return (
    <div
      style={{
        position: "relative", 
        width: "1280px",
        height: "832px",
        margin: "0 auto", 
        background: "white",
      }}
    >
      <div
        ref={p5ContainerRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "832px",
          zIndex: 2,
          pointerEvents: "auto",
        }}
      />
      <RiveComponent
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "832px",
          zIndex: 0,
          pointerEvents: "auto",
        }}
      />
    </div>
  );
};
export default CombinedPoolExperience;
