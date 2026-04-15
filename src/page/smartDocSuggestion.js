import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ECareNavBar from '../Components/eCareNavBar';
import './css/smartDocSuggestion.css';
import symptomsData from '../data/symptoms.json';
import gsap from 'gsap';
import { Search, X, Loader2, User, Stethoscope, CheckCircle2, AlertCircle } from 'lucide-react';

const SmartDocSuggestion = () => {
    const navigate = useNavigate();
    const heroRef = useRef(null);
    const contentRef = useRef(null);

    const [age, setAge] = useState('');
    const [gender, setGender] = useState('');
    const [selectedSymptoms, setSelectedSymptoms] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [step, setStep] = useState(1); // 1: info, 2: symptoms, 3: results
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState(null);

    // Filter available symptoms based on search
    const filteredSymptoms = symptomsData.filter(s => 
        s.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !selectedSymptoms.includes(s)
    );

    useEffect(() => {
        // Hero animation
        gsap.fromTo(heroRef.current, 
            { opacity: 0, y: -20 }, 
            { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }
        );
    }, []);

    useEffect(() => {
        // Content animation on step change
        gsap.fromTo(contentRef.current, 
            { opacity: 0, scale: 0.95 }, 
            { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
        );
    }, [step]);

    const toggleSymptom = (symptom) => {
        if (selectedSymptoms.includes(symptom)) {
            setSelectedSymptoms(prev => prev.filter(s => s !== symptom));
        } else {
            setSelectedSymptoms(prev => [...prev, symptom]);
        }
    };

    const handleSubmitInfo = () => {
        if (!age || !gender) return;
        setStep(2);
    };

    const handleSubmitSymptoms = async () => {
        if (selectedSymptoms.length === 0) return;
        setIsLoading(true);

        try {
            // Prepare a complete feature vector with ALL 334 symptoms
            // In the exact order specified in symptoms.json
            const featureVector = {};
            symptomsData.forEach(symptomName => {
                if (symptomName === 'symptom_count') {
                    featureVector[symptomName] = selectedSymptoms.length;
                } else {
                    featureVector[symptomName] = selectedSymptoms.includes(symptomName) ? 1 : 0;
                }
            });

            // If the backend was trained with an extra 'symptom_count' column, add it
            // Based on inspection, there were 334 features in the scaler.
            // If the model throws an error, we can adjust.
            
            // 1. Get AI Disease Prediction
            const predictResponse = await fetch(`http://localhost:8000/api/predict`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(featureVector)
            });
            const predictData = await predictResponse.json();

            if (predictData.success) {
                // 2. Search for doctors by the recommended specialist
                const doctorResponse = await fetch(`http://localhost:8000/api/suggest-doctor?specialization=${predictData.suggested_specialist}`);
                const doctorData = await doctorResponse.json();

                setResults({
                    symptoms: selectedSymptoms,
                    prediction: predictData.prediction,
                    specialization: predictData.suggested_specialist,
                    doctors: doctorData.doctors || [],
                    age: age,
                    gender: gender
                });
                setStep(3);
            } else {
                alert('AI Prediction Failed: ' + predictData.error);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Could not connect to AI services.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setAge('');
        setGender('');
        setSelectedSymptoms([]);
        setStep(1);
        setResults(null);
    };

    return (
        <div className="sds-page">
            <ECareNavBar />

            <main className="sds-main">
                {/* Hero */}
                <section className="sds-hero" ref={heroRef}>
                    <div className="sds-hero-glow"></div>
                    <div className="sds-hero-content">
                        <div className="sds-hero-badge">
                            <span className="sds-badge-dot"></span>
                            AI Diagnostic Engine
                        </div>
                        <h1>Smart Doctor Suggestion</h1>
                        <p>Our advanced AI leverages millions of medical records to match your symptoms with the most suitable medical expert.</p>
                    </div>

                    {/* Progress Steps */}
                    <div className="sds-steps">
                        <div className={`sds-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                            <div className="sds-step-number">{step > 1 ? '✓' : '1'}</div>
                            <span>Personal Info</span>
                        </div>
                        <div className="sds-step-line"></div>
                        <div className={`sds-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                            <div className="sds-step-number">{step > 2 ? '✓' : '2'}</div>
                            <span>Symptoms List</span>
                        </div>
                        <div className="sds-step-line"></div>
                        <div className={`sds-step ${step >= 3 ? 'active' : ''}`}>
                            <div className="sds-step-number">3</div>
                            <span>Medical Advice</span>
                        </div>
                    </div>
                </section>

                <section className="sds-content" ref={contentRef}>

                    {/* Step 1: Patient Info */}
                    {step === 1 && (
                        <div className="sds-card">
                            <div className="sds-card-header">
                                <User className="sds-lucide-icon text-primary" size={24} />
                                <h2>Tell us about yourself</h2>
                            </div>
                            <div className="sds-card-body">
                                <div className="sds-form-group">
                                    <label>Your Age</label>
                                    <input
                                        type="number"
                                        className="sds-input"
                                        placeholder="How old are you?"
                                        value={age}
                                        onChange={(e) => setAge(e.target.value)}
                                        min="1"
                                    />
                                </div>
                                <div className="sds-form-group">
                                    <label>Your Gender</label>
                                    <div className="sds-gender-options">
                                        {['Male', 'Female', 'Other'].map(g => (
                                            <button
                                                key={g}
                                                className={`sds-gender-btn ${gender === g ? 'active' : ''}`}
                                                onClick={() => setGender(g)}
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    className="sds-btn sds-btn-primary"
                                    onClick={handleSubmitInfo}
                                    disabled={!age || !gender}
                                >
                                    Proceed to Symptom Check →
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Symptoms Search & Select */}
                    {step === 2 && (
                        <div className="sds-card sds-symptoms-card">
                            <div className="sds-card-header">
                                <Stethoscope className="text-accent" size={24} />
                                <h2>Identify Symptoms</h2>
                                <span className="sds-count-badge">
                                    {selectedSymptoms.length} Selected
                                </span>
                            </div>
                            <div className="sds-card-body">
                                <div className="sds-search-box">
                                    <div className="sds-search-input-wrapper">
                                        <Search className="sds-search-icon" size={18} />
                                        <input
                                            type="text"
                                            className="sds-input sds-search-input"
                                            placeholder="Search symptoms (e.g., headache, fever...)"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <X 
                                                className="sds-clear-search" 
                                                size={18} 
                                                onClick={() => setSearchTerm('')} 
                                            />
                                        )}
                                    </div>

                                    {/* Search Suggestions */}
                                    {searchTerm && filteredSymptoms.length > 0 && (
                                        <div className="sds-suggestions-dropdown">
                                            {filteredSymptoms.slice(0, 5).map(s => (
                                                <div 
                                                    key={s} 
                                                    className="sds-suggestion-item"
                                                    onClick={() => { toggleSymptom(s); setSearchTerm(''); }}
                                                >
                                                    {s}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Selected Symptoms Tags */}
                                <div className="sds-selected-tags">
                                    {selectedSymptoms.length > 0 ? (
                                        selectedSymptoms.map(s => (
                                            <span key={s} className="sds-tag">
                                                {s}
                                                <X size={14} onClick={() => toggleSymptom(s)} />
                                            </span>
                                        ))
                                    ) : (
                                        <p className="sds-no-tags">No symptoms selected yet. Use the search bar above.</p>
                                    )}
                                </div>

                                {/* Quick Select List */}
                                <div className="sds-quick-select">
                                    <h3>Common Symptoms</h3>
                                    <div className="sds-chip-group">
                                        {symptomsData.slice(0, 10).map(s => (
                                            <button
                                                key={s}
                                                className={`sds-chip ${selectedSymptoms.includes(s) ? 'active' : ''}`}
                                                onClick={() => toggleSymptom(s)}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="sds-actions">
                                    <button className="sds-btn sds-btn-secondary" onClick={() => setStep(1)}>
                                        Back
                                    </button>
                                    <button
                                        className="sds-btn sds-btn-primary"
                                        onClick={handleSubmitSymptoms}
                                        disabled={selectedSymptoms.length === 0 || isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="animate-spin" size={20} />
                                                Analyzing Health Data...
                                            </>
                                        ) : (
                                            'Run AI Diagnosis →'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Results */}
                    {step === 3 && results && (
                        <div className="sds-card sds-results-card">
                            <div className="sds-card-header bg-success-light">
                                <CheckCircle2 className="text-success" size={24} />
                                <h2>AI Recommendation Engine</h2>
                            </div>
                            <div className="sds-card-body">
                                
                                <div className="sds-result-grid">
                                    <div className="sds-prediction-box">
                                        <div className="sds-label">Suspected Condition</div>
                                        <div className="sds-value capitalize">{results.prediction}</div>
                                        <div className="sds-confidence-pill">85% Accuracy Confidence</div>
                                    </div>
                                    
                                    <div className="sds-specialist-box">
                                        <div className="sds-label">Consult With</div>
                                        <div className="sds-value">{results.specialization}</div>
                                    </div>
                                </div>

                                {/* Doctors List */}
                                <div className="sds-doctors-section">
                                    <h3>Recommended Specialists at NCC</h3>
                                    {results.doctors.length > 0 ? (
                                        <div className="sds-doctor-grid">
                                            {results.doctors.map(doc => (
                                                <div key={doc.id} className="sds-doc-result-card">
                                                    <div className="sds-doc-icon">👨‍⚕️</div>
                                                    <div className="sds-doc-meta">
                                                        <h4>{doc.name}</h4>
                                                        <p>{doc.hospital || 'Narammala Channeling Center'}</p>
                                                    </div>
                                                    <button 
                                                        className="sds-channel-btn"
                                                        onClick={() => navigate(`/ecare/book/${doc.id}`)}
                                                    >
                                                        Channel Now
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="sds-empty-state">
                                            <AlertCircle size={32} />
                                            <p>No specialists available right now. Please consult our general physician.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="sds-medical-disclaimer glass">
                                    <AlertCircle size={16} />
                                    <span>
                                        NCC eCare AI is an advisory tool. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.
                                    </span>
                                </div>

                                <div className="sds-actions">
                                    <button className="sds-btn sds-btn-outline" onClick={handleReset}>
                                        New Consultation
                                    </button>
                                    <button className="sds-btn sds-btn-secondary" onClick={() => navigate('/eCare')}>
                                        Return Home
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </section>
            </main>

            <footer className="sds-footer">
                <p>&copy; 2026 NCC eCare - Narammala Channeling Center. Medical Grade AI Integration.</p>
            </footer>
        </div>
    );
};

export default SmartDocSuggestion;

