import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// A simplified spring physics implementation based on the principles used by libraries like Motion.
const springSimulation = (config) => {
    let { stiffness, damping, mass, velocity } = {
        stiffness: 100,
        damping: 10,
        mass: 1,
        velocity: 0,
        ...config
    };
    const restSpeed = 0.001;
    const restDelta = 0.001;

    let position = 0;
    const endPosition = 1;
    const points = [];
    const step = 1 / 60; // 60 FPS simulation

    let isAtRest = false;
    let frameCount = 0;
    const maxFrames = 1000; // Prevent infinite loops

    while (!isAtRest && frameCount < maxFrames) {
        const springForce = -stiffness * (position - endPosition);
        const dampingForce = -damping * velocity;
        const acceleration = (springForce + dampingForce) / mass;

        velocity += acceleration * step;
        position += velocity * step;

        points.push(parseFloat(position.toFixed(4)));

        const isMoving = Math.abs(velocity) > restSpeed;
        const isSettled = Math.abs(endPosition - position) < restDelta;

        if (!isMoving && isSettled) {
            isAtRest = true;
            // Ensure the final value is exactly the end position
            if (points[points.length - 1] !== endPosition) {
                 points.push(endPosition);
            }
        }
        frameCount++;
    }

    return points;
};


// --- React Components ---

const InfoPopover = ({ text }) => (
    <div className="relative group flex items-center">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 cursor-pointer">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-800 text-white text-sm rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            {text}
        </div>
    </div>
);


const Slider = ({ label, value, min, max, step = 1, onChange, unit = '', description }) => (
    <div className="flex flex-col space-y-2">
        <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
                 <label htmlFor={label} className="font-medium text-gray-700">{label}</label>
                 {description && <InfoPopover text={description} />}
            </div>
            <span className="px-2 py-1 text-sm bg-gray-200 rounded-md">{value}{unit}</span>
        </div>
        <input
            id={label}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
        />
    </div>
);

const AnimationPreview = ({ cssLinearFunction, animationKey, duration }) => {
    const style = {
        '--easing-function': cssLinearFunction,
        animation: `moveRight ${duration}s var(--easing-function) forwards`,
    };

    return (
        <div>
            <div className="w-full bg-gray-100 p-8 rounded-lg border border-gray-200">
                <style>
                    {`
                        @keyframes moveRight {
                            from { transform: translateX(0%); }
                            to { transform: translateX(90%); }
                        }
                    `}
                </style>
                <div key={animationKey} style={style} className="w-12 h-12 bg-blue-500 rounded-full"></div>
            </div>
            <code className="text-sm text-gray-500 mt-2 block text-center">
          CSS linear()
        </code>
    </div>
    );
};

const MotionAnimationPreview = ({ stiffness, damping, mass, velocity, animationKey }) => {
    return (
        <div className="">
        <div className="w-full bg-gray-100 p-8 rounded-lg border border-gray-200">
            <motion.div
                key={animationKey}
                className="w-12 h-12 bg-purple-500 rounded-full"
                initial={{ x: 0 }}
                animate={{ x: '90%' }}
                transition={{
                    type: 'spring',
                    stiffness,
                    damping,
                    mass,
                    velocity,
                }}
            />
        </div>
        <code className="text-sm text-gray-500 mt-2 block text-center">
          &lt;motion.div /&gt;
        </code>
    </div>
    );
};


function App() {
    const [stiffness, setStiffness] = useState(100);
    const [damping, setDamping] = useState(10);
    const [mass, setMass] = useState(1);
    const [velocity, setVelocity] = useState(0);
    const [duration] = useState(2);
    const [cssLinearFunction, setCssLinearFunction] = useState('');
    const [animationKey, setAnimationKey] = useState(0);
    const outputRef = useRef(null);

    const descriptions = {
        stiffness: "Stiffness of the spring. Higher values will create more sudden movement.",
        damping: "Strength of opposing force. If set to 0, the spring will oscillate indefinitely.",
        mass: "Mass of the moving object. Higher values will result in more lethargic movement.",
        velocity: "The initial velocity of the spring."
    };

    useEffect(() => {
        const points = springSimulation({ stiffness, damping, mass, velocity });
        const linearString = `linear(${points.join(', ')})`;
        setCssLinearFunction(linearString);
        setAnimationKey(prev => prev + 1); // Re-trigger animation
    }, [stiffness, damping, mass, velocity]);

    const replayAnimation = () => {
        setAnimationKey(prev => prev + 1);
    };

    const copyToClipboard = () => {
        if (outputRef.current) {
            outputRef.current.select();
            try {
                // Use document.execCommand as a fallback for iFrame environments
                document.execCommand('copy');
                // A simple confirmation UI instead of alert()
                const copyButton = document.querySelector('#copy-button');
                if(copyButton) {
                    const originalText = copyButton.textContent;
                    copyButton.textContent = 'Copied!';
                    setTimeout(() => {
                        copyButton.textContent = originalText;
                    }, 2000);
                }
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex items-center justify-center p-4">
            <div className="w-full max-w-4xl mx-auto">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">Spring to CSS `linear()` Generator</h1>
                    <p className="text-gray-600 mt-2">Use <a href="https://motion.dev/docs/spring">Motion</a>-style spring physics to generate a CSS easing function.</p>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Left Column: Controls */}
                    <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 space-y-6">
                        <h2 className="text-xl font-semibold text-gray-800 border-b pb-2">Spring Configuration</h2>
                        <Slider label="Stiffness" value={stiffness} min="1" max="500" onChange={setStiffness} description={descriptions.stiffness} />
                        <Slider label="Damping" value={damping} min="1" max="100" onChange={setDamping} description={descriptions.damping} />
                        <Slider label="Mass" value={mass} min="0.1" max="10" step="0.1" onChange={setMass} description={descriptions.mass} />
                        <Slider label="Velocity" value={velocity} min="-20" max="20" step="0.5" onChange={setVelocity} description={descriptions.velocity} />
                    </div>

                    {/* Right Column: Output & Preview */}
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xl font-semibold text-gray-800">Animation Preview</h2>
                                <button
                                    onClick={replayAnimation}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                                >
                                    Replay
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <AnimationPreview cssLinearFunction={cssLinearFunction} animationKey={animationKey} duration={duration} />
                                <MotionAnimationPreview stiffness={stiffness} damping={damping} mass={mass} velocity={velocity} animationKey={animationKey} />
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                             <div className="flex justify-between items-center mb-3">
                                <h2 className="text-xl font-semibold text-gray-800">CSS Output</h2>
                                <button
                                    id="copy-button"
                                    onClick={copyToClipboard}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                                >
                                    Copy
                                </button>
                            </div>
                            <textarea
                                ref={outputRef}
                                readOnly
                                value={`animation-timing-function: ${cssLinearFunction};`}
                                className="w-full h-32 p-3 font-mono text-sm bg-gray-100 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
