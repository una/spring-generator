import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const clamp = (min, max, v) => Math.min(Math.max(v, min), max);
const millisecondsToSeconds = (ms) => ms / 1000;
const secondsToMilliseconds = (s) => s * 1000;

const springDefaults = {
    stiffness: 100,
    damping: 10,
    mass: 1.0,
    velocity: 0.0,
    duration: 800,
    bounce: 0.3,
    visualDuration: 0.3,
    restSpeed: {
        granular: 0.01,
        default: 2,
    },
    restDelta: {
        granular: 0.005,
        default: 0.5,
    },
    minDuration: 0.01,
    maxDuration: 10.0,
    minDamping: 0.05,
    maxDamping: 1,
};

const durationKeys = ["duration", "bounce"];
const physicsKeys = ["stiffness", "damping", "mass"];

function isSpringType(options, keys) {
    return keys.some((key) => options[key] !== undefined);
}

function getSpringOptions(options) {
    let springOptions = {
        velocity: springDefaults.velocity,
        stiffness: springDefaults.stiffness,
        damping: springDefaults.damping,
        mass: springDefaults.mass,
        isResolvedFromDuration: false,
        ...options,
    };

    if (
        !isSpringType(options, physicsKeys) &&
        isSpringType(options, durationKeys)
    ) {
        if (options.visualDuration) {
            const visualDuration = options.visualDuration;
            const root = (2 * Math.PI) / (visualDuration * 1.2);
            const stiffness = root * root;
            const damping =
                2 *
                clamp(0.05, 1, 1 - (options.bounce || 0)) *
                Math.sqrt(stiffness);

            springOptions = {
                ...springOptions,
                mass: springDefaults.mass,
                stiffness,
                damping,
            };
        } else {
            const derived = findSpring(options);

            springOptions = {
                ...springOptions,
                ...derived,
                mass: springDefaults.mass,
            };
            springOptions.isResolvedFromDuration = true;
        }
    }

    return springOptions;
}

function spring(optionsOrVisualDuration, bounce) {
    const options =
        typeof optionsOrVisualDuration !== "object"
            ? {
                  visualDuration: optionsOrVisualDuration,
                  keyframes: [0, 1],
                  bounce,
              }
            : optionsOrVisualDuration;

    let { restSpeed, restDelta } = options;

    const origin = options.keyframes[0];
    const target = options.keyframes[options.keyframes.length - 1];

    const state = { done: false, value: origin };

    const {
        stiffness,
        damping,
        mass,
        duration,
        velocity,
        isResolvedFromDuration,
    } = getSpringOptions({
        ...options,
        velocity: -millisecondsToSeconds(options.velocity || 0),
    });

    const initialVelocity = velocity || 0.0;
    const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));

    const initialDelta = target - origin;
    const undampedAngularFreq = millisecondsToSeconds(
        Math.sqrt(stiffness / mass)
    );

    const isGranularScale = Math.abs(initialDelta) < 5;
    restSpeed ||= isGranularScale
        ? springDefaults.restSpeed.granular
        : springDefaults.restSpeed.default;
    restDelta ||= isGranularScale
        ? springDefaults.restDelta.granular
        : springDefaults.restDelta.default;

    let resolveSpring;
    if (dampingRatio < 1) {
        const angularFreq = calcAngularFreq(undampedAngularFreq, dampingRatio);

        resolveSpring = (t) => {
            const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);

            return (
                target -
                envelope *
                    (((initialVelocity +
                        dampingRatio * undampedAngularFreq * initialDelta) /
                        angularFreq) *
                        Math.sin(angularFreq * t) +
                        initialDelta * Math.cos(angularFreq * t))
            );
        };
    } else if (dampingRatio === 1) {
        resolveSpring = (t) =>
            target -
            Math.exp(-undampedAngularFreq * t) *
                (initialDelta +
                    (initialVelocity + undampedAngularFreq * initialDelta) * t);
    } else {
        const dampedAngularFreq =
            undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);

        resolveSpring = (t) => {
            const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
            const freqForT = Math.min(dampedAngularFreq * t, 300);

            return (
                target -
                (envelope *
                    ((initialVelocity +
                        dampingRatio * undampedAngularFreq * initialDelta) *
                        Math.sinh(freqForT) +
                        dampedAngularFreq *
                            initialDelta *
                            Math.cosh(freqForT))) /
                    dampedAngularFreq
            );
        };
    }

    const generator = {
        calculatedDuration: isResolvedFromDuration ? duration || null : null,
        next: (t) => {
            const current = resolveSpring(t);

            if (!isResolvedFromDuration) {
                let currentVelocity = t === 0 ? initialVelocity : 0.0;

                if (dampingRatio < 1) {
                    currentVelocity =
                        t === 0
                            ? secondsToMilliseconds(initialVelocity)
                            : calcGeneratorVelocity(resolveSpring, t, current);
                }

                const isBelowVelocityThreshold =
                    Math.abs(currentVelocity) <= restSpeed;
                const isBelowDisplacementThreshold =
                    Math.abs(target - current) <= restDelta;

                state.done =
                    isBelowVelocityThreshold && isBelowDisplacementThreshold;
            } else {
                state.done = t >= duration;
            }

            state.value = state.done ? target : current;

            return state;
        },
        toString: () => {
            const calculatedDuration = Math.min(
                calcGeneratorDuration(generator),
                maxGeneratorDuration
            );

            const easing = generateLinearEasing(
                (progress) =>
                    generator.next(calculatedDuration * progress).value,
                calculatedDuration,
                30
            );

            return `linear(${easing.join(", ")})`;
        },
    };

    return generator;
}

const safeMin = 0.001;

function findSpring({
    duration = springDefaults.duration,
    bounce = springDefaults.bounce,
    velocity = springDefaults.velocity,
    mass = springDefaults.mass,
}) {
    let envelope;
    let derivative;

    let dampingRatio = 1 - bounce;

    dampingRatio = clamp(
        springDefaults.minDamping,
        springDefaults.maxDamping,
        dampingRatio
    );

    duration = clamp(
        springDefaults.minDuration,
        springDefaults.maxDuration,
        millisecondsToSeconds(duration)
    );

    if (dampingRatio < 1) {
        envelope = (undampedFreq) => {
            const exponentialDecay = undampedFreq * dampingRatio;
            const delta = exponentialDecay * duration;
            const a = exponentialDecay - velocity;
            const b = calcAngularFreq(undampedFreq, dampingRatio);
            const c = Math.exp(-delta);
            return safeMin - (a / b) * c;
        };

        derivative = (undampedFreq) => {
            const exponentialDecay = undampedFreq * dampingRatio;
            const delta = exponentialDecay * duration;
            const d = delta * velocity + velocity;
            const e =
                Math.pow(dampingRatio, 2) * Math.pow(undampedFreq, 2) * duration;
            const f = Math.exp(-delta);
            const g = calcAngularFreq(Math.pow(undampedFreq, 2), dampingRatio);
            const factor = -envelope(undampedFreq) + safeMin > 0 ? -1 : 1;
            return (factor * ((d - e) * f)) / g;
        };
    } else {
        envelope = (undampedFreq) => {
            const a = Math.exp(-undampedFreq * duration);
            const b = (undampedFreq - velocity) * duration + 1;
            return -safeMin + a * b;
        };

        derivative = (undampedFreq) => {
            const a = Math.exp(-undampedFreq * duration);
            const b = (velocity - undampedFreq) * (duration * duration);
            return a * b;
        };
    }

    const initialGuess = 5 / duration;
    const undampedFreq = approximateRoot(envelope, derivative, initialGuess);

    duration = secondsToMilliseconds(duration);

    if (isNaN(undampedFreq)) {
        return {
            stiffness: springDefaults.stiffness,
            damping: springDefaults.damping,
            duration,
        };
    } else {
        const stiffness = Math.pow(undampedFreq, 2) * mass;
        return {
            stiffness,
            damping: dampingRatio * 2 * Math.sqrt(mass * stiffness),
            duration,
        };
    }
}

const rootIterations = 12;

function approximateRoot(envelope, derivative, initialGuess) {
    let result = initialGuess;
    for (let i = 1; i < rootIterations; i++) {
        result = result - envelope(result) / derivative(result);
    }
    return result;
}

function calcAngularFreq(undampedFreq, dampingRatio) {
    return undampedFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
}

function calcGeneratorVelocity(resolve, t, current) {
    const prevT = Math.max(t - 5, 0);
    return (current - resolve(prevT)) / (t - prevT);
}

const springSimulation = (config) => {
    const generator = spring({ keyframes: [0, 1], ...config });
    const points = [];
    let t = 0;
    const step = 16.666;
    while (true) {
        const { value, done } = generator.next(t);
        points.push(value);
        if (done) {
            break;
        }
        t += step;
    }
    return points;
};

const maxGeneratorDuration = 10000;

function calcGeneratorDuration(generator) {
    let t = 0;
    const step = 50;
    while (t < maxGeneratorDuration) {
        if (generator.next(t).done) {
            break;
        }
        t += step;
    }
    return t;
}

function generateLinearEasing(generator, duration, resolution = 30) {
    const points = [];
    for (let i = 0; i < resolution; i++) {
        points.push(generator(i / (resolution - 1)));
    }
    return points;
}


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
        <div>
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
        const generator = spring({ keyframes: [0, 1], stiffness, damping, mass, velocity });
        setCssLinearFunction(generator.toString());
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
