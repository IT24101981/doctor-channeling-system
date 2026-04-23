import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ECareNavBar from '../Components/eCareNavBar';
import './css/reportExplainer.css';

const ReportExplainer = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [uploadedFiles, setUploadedFiles] = useState([]); // Array of File objects
    const [filePreviews, setFilePreviews] = useState([]); // Array of preview objects {url, name, type}
    const [selectedLanguage, setSelectedLanguage] = useState('English');
    const [selectedModel, setSelectedModel] = useState('Gemini 2.5 Flash');
    const [ocrText, setOcrText] = useState('');
    const [explainedText, setExplainedText] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [step, setStep] = useState(1); // 1: upload, 2: review OCR, 3: results

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    const handleFiles = (files) => {
        const validExtensions = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        const newFiles = files.filter(file => validExtensions.includes(file.type) || file.name.toLowerCase().endsWith('.pdf'));

        if (newFiles.length === 0) {
            alert('Please upload valid files (JPEG, PNG, or PDF).');
            return;
        }

        if (uploadedFiles.length + newFiles.length > 5) {
            alert('You can upload a maximum of 5 files.');
            const remainingSlots = 5 - uploadedFiles.length;
            if (remainingSlots <= 0) return;
            newFiles.splice(remainingSlots);
        }

        setUploadedFiles(prev => [...prev, ...newFiles]);

        newFiles.forEach(file => {
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                // PDF preview icon
                setFilePreviews(prev => [...prev, {
                    url: 'pdf-icon', // We'll handle this in render
                    name: file.name,
                    type: 'pdf'
                }]);
            } else {
                const reader = new FileReader();
                reader.onload = (e) => {
                    setFilePreviews(prev => [...prev, {
                        url: e.target.result,
                        name: file.name,
                        type: 'image'
                    }]);
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const removeFile = (index) => {
        setUploadedFiles(prev => prev.filter((_, i) => i !== index));
        setFilePreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleExtractText = async () => {
        if (uploadedFiles.length === 0) return;
        setIsExtracting(true);
        try {
            const formData = new FormData();
            uploadedFiles.forEach(file => {
                formData.append('files', file);
            });

            const AI_API_URL = process.env.REACT_APP_AI_API_URL || 'http://localhost:8000';
            const response = await fetch(`${AI_API_URL}/api/ocr`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (data.text) {
                setOcrText(data.text);
                setStep(2);
            } else {
                alert('Cant extract text.');
            }
        } catch (error) {
            console.error('OCR Error:', error);
            alert('Cant connect to server.');
        }
        setIsExtracting(false);
    };

    const handleAnalyze = async () => {
        if (!ocrText.trim()) return;
        setIsAnalyzing(true);
        try {
            const AI_API_URL = process.env.REACT_APP_AI_API_URL || 'http://localhost:8000';
            const response = await fetch(`${AI_API_URL}/api/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    text: ocrText,
                    language: selectedLanguage,
                    model: selectedModel
                }),
            });

            const data = await response.json();
            if (data.explanation) {
                setExplainedText(data.explanation);
                setStep(3);
            } else {
                alert('Cant explain text.');
            }
        } catch (error) {
            console.error('AI Error:', error);
            alert('Cant connect to server.');
        }
        setIsAnalyzing(false);
    };

    const handleReset = () => {
        setUploadedFiles([]);
        setFilePreviews([]);
        setOcrText('');
        setExplainedText('');
        setStep(1);
        setIsAnalyzing(false);
        setIsExtracting(false);
    };

    const renderSimpleMarkdown = (text) => {
        return text.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('### ')) {
                return <h4 key={i} className="re-md-h4">{line.replace('### ', '')}</h4>;
            }
            if (line.startsWith('## ')) {
                return <h3 key={i} className="re-md-h3">{line.replace('## ', '')}</h3>;
            }
            // List items
            if (line.match(/^\d+\.\s/)) {
                return <p key={i} className="re-md-list-item">{renderBold(line)}</p>;
            }
            if (line.startsWith('- ')) {
                return <p key={i} className="re-md-list-item re-md-bullet">{renderBold(line.replace('- ', ''))}</p>;
            }
            // Italic disclaimer
            if (line.startsWith('*') && line.endsWith('*')) {
                return <p key={i} className="re-md-disclaimer">{line.replace(/\*/g, '')}</p>;
            }
            // Empty lines
            if (line.trim() === '') {
                return <br key={i} />;
            }
            // Normal paragraphs
            return <p key={i} className="re-md-paragraph">{renderBold(line)}</p>;
        });
    };

    const renderBold = (text) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i}>{part.replace(/\*\*/g, '')}</strong>;
            }
            return part;
        });
    };

    return (
        <div className="re-page">
            <ECareNavBar />

            <main className="re-main">
                {/* Hero Header */}
                <section className="re-hero">
                    <div className="re-hero-glow"></div>
                    <div className="re-hero-content">

                        <h1>AI Report Explainer</h1>
                        <p>Upload up to 5 medical reports (Image or PDF) and get instant AI-powered explanations in your preferred language.</p>
                    </div>

                    {/* Steps Indicator */}
                    <div className="re-steps">
                        <div className={`re-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
                            <div className="re-step-number">
                                {step > 1 ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                ) : '1'}
                            </div>
                            <span>Upload Report</span>
                        </div>
                        <div className="re-step-line"></div>
                        <div className={`re-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
                            <div className="re-step-number">
                                {step > 2 ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                                ) : '2'}
                            </div>
                            <span>Review Text</span>
                        </div>
                        <div className="re-step-line"></div>
                        <div className={`re-step ${step >= 3 ? 'active' : ''}`}>
                            <div className="re-step-number">3</div>
                            <span>AI Explanation</span>
                        </div>
                    </div>
                </section>

                {/* Main Content Area */}
                <section className="re-content">
                    <div className="re-content-grid">
                        {/* Left Panel — Upload & Image Preview */}
                        <div className="re-panel re-upload-panel">
                            <div className="re-panel-header">
                                <div className="re-panel-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                                    </svg>
                                </div>
                                <h2>Medical Report</h2>
                            </div>

                            <div
                                className={`re-dropzone ${dragActive ? 'drag-active' : ''}`}
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                style={{ display: filePreviews.length >= 5 ? 'none' : 'block' }}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    onChange={handleFileInput}
                                    multiple
                                    hidden
                                />
                                <div className="re-dropzone-icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                                    </svg>
                                </div>
                                <h3>Drop your reports here</h3>
                                <p>or click to browse files (Limit: 5)</p>
                                <span className="re-dropzone-formats">Supports: JPEG, PNG, WebP, PDF</span>
                            </div>

                            {filePreviews.length > 0 && (
                                <div className="re-file-list">
                                    {filePreviews.map((file, index) => (
                                        <div key={index} className="re-file-item">
                                            <div className="re-file-thumb">
                                                {file.type === 'pdf' ? (
                                                    <svg className="re-pdf-thumb-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3.5h-1.25V9H19v1.25h-1.25V13H16V7h1.75v1zM9 9h1v1H9V9zm5 2h1V8.5h-1V11zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z" />
                                                    </svg>
                                                ) : (
                                                    <img src={file.url} alt={file.name} />
                                                )}
                                            </div>
                                            <div className="re-file-info">
                                                <div className="re-file-name">{file.name}</div>
                                                <div className="re-file-type">{file.type.toUpperCase()}</div>
                                            </div>
                                            <button className="re-file-remove" onClick={() => removeFile(index)}>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                                                </svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {step === 1 && filePreviews.length > 0 && (
                                <div className="re-btn-extract-container">
                                    <button className="re-btn-extract" onClick={handleExtractText} disabled={isExtracting}>
                                        {isExtracting ? (
                                            <>
                                                <div className="re-spinner"></div>
                                                Extracting Text...
                                            </>
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                                                </svg>
                                                Extract Text from Files
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                        </div>

                        {/* Right Panel — OCR Text / Results */}
                        <div className="re-panel re-text-panel">
                            {step === 1 && !ocrText && (
                                <div className="re-empty-state">
                                    <div className="re-empty-icon">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                                        </svg>
                                    </div>
                                    <h3>No Report Uploaded Yet</h3>
                                    <p>Upload a medical report image to begin. The AI will extract and analyze the text for you.</p>
                                </div>
                            )}

                            {(step === 2 || (step >= 2 && ocrText)) && (
                                <div className="re-ocr-section">
                                    <div className="re-panel-header">
                                        <div className="re-panel-icon re-panel-icon-teal">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                                            </svg>
                                        </div>
                                        <h2>Extracted Text</h2>
                                        <span className="re-editable-badge">Editable</span>
                                    </div>
                                    <p className="re-ocr-hint">Review and edit the extracted text below. Make corrections if needed before analyzing.</p>
                                    <textarea
                                        className="re-ocr-textarea"
                                        value={ocrText}
                                        onChange={(e) => setOcrText(e.target.value)}
                                        placeholder="Extracted text will appear here..."
                                        rows={12}
                                    />

                                    <div className="re-analysis-settings">
                                        <div className="re-setting-group">
                                            <h3>Summary Language</h3>
                                            <div className="re-lang-options">
                                                {['English', 'Sinhala', 'Tamil'].map(lang => (
                                                    <button
                                                        key={lang}
                                                        className={`re-lang-btn ${selectedLanguage === lang ? 'active' : ''}`}
                                                        onClick={() => setSelectedLanguage(lang)}
                                                    >
                                                        {lang}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="re-setting-group">
                                            <h3>AI Model</h3>
                                            <select 
                                                className="re-model-select"
                                                value={selectedModel}
                                                onChange={(e) => setSelectedModel(e.target.value)}
                                            >
                                                <option value="Gemini 2.5 Flash">Gemini 2.5 Flash</option>
                                                <option value="Gemini 3.1 Flash Lite Preview">Gemini 3.1 Flash Lite Preview</option>
                                                <option value="Gemma 4 26B">Gemma 4 26B</option>
                                                <option value="Gemma 3 27B">Gemma 3 27B</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="re-ocr-actions">
                                        <button className="re-btn re-btn-secondary" onClick={handleReset}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                                            </svg>
                                            Start Over
                                        </button>
                                        <button
                                            className="re-btn re-btn-primary"
                                            onClick={handleAnalyze}
                                            disabled={isAnalyzing || !ocrText.trim()}
                                        >
                                            {isAnalyzing ? (
                                                <>
                                                    <div className="re-spinner re-spinner-white"></div>
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
                                                    </svg>
                                                    Analyze with AI
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {step === 3 && explainedText && (
                                <div className="re-results-section">
                                    <div className="re-panel-header">
                                        <div className="re-panel-icon re-panel-icon-green">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
                                            </svg>
                                        </div>
                                        <h2>AI Explanation</h2>
                                    </div>
                                    <div className="re-results-content">
                                        {renderSimpleMarkdown(explainedText)}
                                    </div>
                                    <div className="re-results-actions">
                                        <button className="re-btn re-btn-secondary" onClick={() => setStep(2)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                                            </svg>
                                            Edit Text & Re-analyze
                                        </button>
                                        <button className="re-btn re-btn-secondary" onClick={handleReset}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                                            </svg>
                                            Upload New Report
                                        </button>
                                        <button className="re-btn re-btn-outline" onClick={() => navigate('/eCare')}>
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                                            </svg>
                                            Back to eCare
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="re-footer">
                <div className="re-footer-content">
                    <p>&copy; 2026 NCC eCare - Narammala Channeling Center. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default ReportExplainer;
