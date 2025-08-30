const MW = (() => {
    // In-memory storage for reports
    let reports = [];
    let isAuthenticated = false;

    const Store = {
        async read() { 
            return [...reports]; 
        },
        async write(list) { 
            reports = [...list]; 
            updateStats();
        },
        async upsert(report) {
            const list = await Store.read();
            const idx = list.findIndex(r => r.id === report.id);
            if (idx >= 0) list[idx] = report;
            else list.push(report);
            await Store.write(list);
        }
    };

    function uid() { 
        return 'r_' + Math.random().toString(36).slice(2, 9); 
    }

    function formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getStatusColor(status) {
        switch(status) {
            case 'pending': return 'pending';
            case 'investigating': return 'investigating';
            case 'resolved': return 'resolved';
            default: return 'pending';
        }
    }

    function updateStats() {
        const totalReports = reports.length;
        const resolvedReports = reports.filter(r => r.status === 'resolved').length;
        const pendingReports = reports.filter(r => r.status === 'pending').length;
        const investigating = reports.filter(r => r.status === 'investigating').length;
        const resolvedPercentage = totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0;

        // Update home page stats with animation
        animateCounter('totalReports', totalReports);
        const resolvedPercentageEl = document.getElementById('resolvedPercentage');
        if (resolvedPercentageEl) {
            animateCounter('resolvedPercentage', resolvedPercentage, '%');
        }

        // Update authority dashboard stats
        animateCounter('pendingReports', pendingReports);
        animateCounter('investigating', investigating);
        animateCounter('resolved', resolvedReports);
    }

    function animateCounter(elementId, targetValue, suffix = '') {
        const element = document.getElementById(elementId);
        if (!element) return;

        const startValue = parseInt(element.textContent) || 0;
        const increment = (targetValue - startValue) / 30;
        let currentValue = startValue;

        const timer = setInterval(() => {
            currentValue += increment;
            if ((increment > 0 && currentValue >= targetValue) || 
                (increment < 0 && currentValue <= targetValue)) {
                currentValue = targetValue;
                clearInterval(timer);
            }
            element.textContent = Math.round(currentValue) + suffix;
        }, 50);
    }

    async function bindReportForm() {
        const form = document.getElementById("reportForm");
        if (!form) return;

        form.addEventListener("submit", async e => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;
            
            // Show loading state
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting Report...';
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';

            // Validate form data
            const reporterName = document.getElementById('reporterName').value.trim();
            const incidentType = document.getElementById('incidentType').value;
            const description = document.getElementById('description').value.trim();
            const lat = parseFloat(document.getElementById('lat').value);
            const lng = parseFloat(document.getElementById('lng').value);

            if (!reporterName || !incidentType || !description || isNaN(lat) || isNaN(lng)) {
                showNotification("Please fill in all required fields correctly.", "error");
                submitBtn.innerHTML = originalHTML;
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                return;
            }

            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            const report = {
                id: uid(),
                reporterName: reporterName,
                incidentType: incidentType,
                description: description,
                lat: lat,
                lng: lng,
                createdAt: new Date().toISOString(),
                status: "pending"
            };

            try {
                await Store.upsert(report);
                
                // Show success animation
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Report Submitted Successfully!';
                submitBtn.style.background = 'var(--success)';
                
                showNotification(`Thank you ${reporterName}! Your report has been submitted successfully.`, "success");
                
                // Reset form
                form.reset();
                
                // Auto-navigate to reports page after 3 seconds
                setTimeout(() => {
                    showPage('myreports');
                }, 3000);
                
            } catch (error) {
                showNotification("Failed to submit report. Please try again.", "error");
            }
            
            // Reset button after delay
            setTimeout(() => {
                submitBtn.innerHTML = originalHTML;
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.background = '';
            }, 4000);
        });
    }

    async function bindAuthorityLogin() {
        const form = document.getElementById("authorityLoginForm");
        if (!form) return;

        form.addEventListener("submit", async e => {
            e.preventDefault();
            
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalHTML = submitBtn.innerHTML;
            const email = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value;

            // Show loading state
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
            submitBtn.disabled = true;

            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Check credentials (demo: admin@mangrovewatch.com / admin123)
            if (email === 'admin@mangrovewatch.com' && password === 'admin123') {
                isAuthenticated = true;
                
                submitBtn.innerHTML = '<i class="fas fa-check"></i> Login Successful!';
                submitBtn.style.background = 'var(--success)';
                
                showNotification("Welcome to Authority Dashboard!", "success");
                
                setTimeout(() => {
                    showPage('authority');
                }, 1500);
            } else {
                showNotification("Invalid credentials. Please check your email and password.", "error");
                submitBtn.innerHTML = originalHTML;
                submitBtn.disabled = false;
            }
        });
    }

    async function renderLeaderboard() {
        const list = await Store.read();
        if (list.length === 0) {
            document.getElementById('activeReporters').textContent = '0';
            document.getElementById('topScore').textContent = '0';
            document.getElementById('thisWeek').textContent = '0';
            return;
        }

        const scores = {};
        
        list.forEach(r => {
            scores[r.reporterName] = (scores[r.reporterName] || 0) + 10;
        });

        const sortedScores = Object.entries(scores)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        const tbody = document.getElementById("leaderboardTable");
        if (!tbody) return;

        const badges = ['🥇', '🥈', '🥉', '🏅', '⭐', '⭐', '⭐', '⭐', '⭐', '⭐'];
        
        if (sortedScores.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-trophy" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                        No reports submitted yet. Be the first to report an incident!
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = sortedScores.map(([name, score], index) => `
                <tr style="animation: fadeInUp 0.5s ease ${index * 0.1}s both;">
                    <td><strong style="color: var(--primary);">#${index + 1}</strong></td>
                    <td><strong>${name}</strong></td>
                    <td>${score / 10}</td>
                    <td><strong style="color: var(--accent);">${score} pts</strong></td>
                    <td><span style="font-size: 1.5rem">${badges[index] || '⭐'}</span></td>
                </tr>
            `).join("");
        }

        // Update leaderboard stats with animation
        animateCounter('activeReporters', sortedScores.length);
        animateCounter('topScore', sortedScores[0]?.[1] || 0);
        
        const thisWeek = list.filter(r => {
            const reportDate = new Date(r.createdAt);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            return reportDate > weekAgo;
        }).length;
        animateCounter('thisWeek', thisWeek);
    }

    async function renderMyReports() {
        const container = document.getElementById("myReportsContainer");
        if (!container) return;

        const list = await Store.read();
        
        if (list.length === 0) {
            container.innerHTML = `
                <div class="card fade-in">
                    <div style="text-align: center; padding: 3rem;">
                        <i class="fas fa-file-alt" style="font-size: 4rem; color: var(--text-muted); margin-bottom: 2rem; display: block;"></i>
                        <h3 style="margin-bottom: 1rem;">No Reports Yet</h3>
                        <p style="color: var(--text-muted); margin-bottom: 2.5rem; line-height: 1.6;">
                            You haven't submitted any reports yet. Help protect our mangroves by reporting incidents you observe.
                        </p>
                        <a href="#" class="btn btn-primary" onclick="showPage('report')">
                            <i class="fas fa-plus"></i>Submit Your First Report
                        </a>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map((r, index) => `
            <div class="card fade-in" style="margin-bottom: 2rem; animation-delay: ${index * 0.1}s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
                    <div style="flex-grow: 1;">
                        <h3 style="margin: 0; color: var(--primary); font-size: 1.3rem;">${r.incidentType}</h3>
                        <p style="margin: 0.75rem 0; color: var(--text-muted); font-size: 0.95rem;">
                            <i class="fas fa-calendar-alt"></i> ${formatDate(r.createdAt)} | 
                            <i class="fas fa-map-marker-alt"></i> ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}
                        </p>
                    </div>
                    <span class="status ${getStatusColor(r.status)}">${r.status.toUpperCase()}</span>
                </div>
                <p style="margin-bottom: 1.5rem; line-height: 1.7; color: var(--text-muted);">${r.description}</p>
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; color: var(--text-muted);">
                    <span>Report ID: <code style="background: var(--surface-dark); padding: 0.25rem 0.5rem; border-radius: 4px; color: var(--primary);">${r.id}</code></span>
                    <span style="color: var(--primary);">+10 points earned</span>
                </div>
            </div>
        `).join("");
    }

    async function renderAuthority() {
        // Check authentication
        if (!isAuthenticated) {
            showPage('authority-login');
            return;
        }

        const tbody = document.getElementById("authorityTable");
        if (!tbody) return;

        const list = await Store.read();
        const searchTerm = document.getElementById('searchReports')?.value.toLowerCase() || '';
        
        const filteredList = list.filter(r => 
            r.reporterName.toLowerCase().includes(searchTerm) ||
            r.incidentType.toLowerCase().includes(searchTerm) ||
            r.description.toLowerCase().includes(searchTerm) ||
            r.id.toLowerCase().includes(searchTerm)
        );

        if (filteredList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                        <i class="fas fa-clipboard-list" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i>
                        ${list.length === 0 ? 'No reports to review at this time.' : 'No reports match your search criteria.'}
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filteredList.map((r, index) => `
            <tr style="animation: fadeInUp 0.3s ease ${index * 0.05}s both;">
                <td><code style="background: var(--surface-dark); padding: 0.25rem 0.5rem; border-radius: 4px; color: var(--primary); font-size: 0.8rem;">${r.id}</code></td>
                <td><strong>${r.reporterName}</strong></td>
                <td>
                    <span style="color: var(--primary);">
                        <i class="fas fa-exclamation-triangle"></i> ${r.incidentType}
                    </span>
                </td>
                <td>
                    <i class="fas fa-map-marker-alt" style="color: var(--primary);"></i> 
                    ${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}
                </td>
                <td style="font-size: 0.9rem;">${formatDate(r.createdAt)}</td>
                <td><span class="status ${getStatusColor(r.status)}">${r.status.toUpperCase()}</span></td>
                <td>
                    <select onchange="updateReportStatus('${r.id}', this.value)" 
                            style="padding: 0.5rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); 
                                   background: var(--surface-light); color: var(--text); cursor: pointer; 
                                   transition: all 0.3s ease;">
                        <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="investigating" ${r.status === 'investigating' ? 'selected' : ''}>Investigating</option>
                        <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resolved</option>
                    </select>
                </td>
            </tr>
        `).join("");
    }

    // Public functions
    window.updateReportStatus = async (reportId, newStatus) => {
        const list = await Store.read();
        const report = list.find(r => r.id === reportId);
        if (report) {
            const oldStatus = report.status;
            report.status = newStatus;
            await Store.upsert(report);
            await renderAuthority();
            showNotification(
                `Report ${reportId.slice(-4)} status updated from ${oldStatus} to ${newStatus}`, 
                'success'
            );
        }
    };

    window.filterReports = () => {
        renderAuthority();
    };

    window.togglePassword = () => {
        const passwordInput = document.getElementById('authPassword');
        const passwordIcon = document.getElementById('passwordIcon');
        
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            passwordIcon.classList.remove('fa-eye');
            passwordIcon.classList.add('fa-eye-slash');
        } else {
            passwordInput.type = 'password';
            passwordIcon.classList.remove('fa-eye-slash');
            passwordIcon.classList.add('fa-eye');
        }
    };

    window.logout = () => {
        isAuthenticated = false;
        showNotification("You have been logged out successfully.", "info");
        showPage('authority-login');
    };

    function showNotification(message, type = 'info') {
        // Remove existing notifications
        document.querySelectorAll('.notification').forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = 'notification';
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const colors = {
            success: 'var(--success)',
            error: 'var(--danger)',
            warning: 'var(--warning)',
            info: 'var(--primary)'
        };

        notification.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            padding: 1.5rem 2rem;
            background: ${colors[type] || colors.info};
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            z-index: 10001;
            transform: translateX(400px);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            max-width: 400px;
            min-width: 300px;
            font-weight: 500;
            border-left: 4px solid rgba(255,255,255,0.3);
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas ${icons[type] || icons.info}" style="font-size: 1.2rem;"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" 
                        style="background: none; border: none; color: white; font-size: 1.2rem; 
                               cursor: pointer; margin-left: auto; padding: 0.25rem; 
                               border-radius: 4px; opacity: 0.8; transition: opacity 0.3s ease;"
                        onmouseover="this.style.opacity='1'; this.style.background='rgba(255,255,255,0.2)'"
                        onmouseout="this.style.opacity='0.8'; this.style.background='none'">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 400);
        }, 5000);
    }

    function initializeLoader() {
        const loader = document.getElementById('loader');
        if (!loader) return;

        // Enhanced loading sequence
        const loadingTexts = [
            'Initializing ecosystem protection platform...',
            'Connecting to mangrove monitoring network...',
            'Loading community reports...',
            'Preparing dashboard...',
            'Almost ready!'
        ];

        let textIndex = 0;
        const loadingTextEl = document.querySelector('.loading-text');
        
        const textInterval = setInterval(() => {
            if (textIndex < loadingTexts.length - 1) {
                textIndex++;
                if (loadingTextEl) {
                    loadingTextEl.style.opacity = '0';
                    setTimeout(() => {
                        loadingTextEl.textContent = loadingTexts[textIndex];
                        loadingTextEl.style.opacity = '1';
                    }, 200);
                }
            }
        }, 600);

        // Hide loader after enhanced loading sequence
        setTimeout(() => {
            clearInterval(textInterval);
            loader.style.opacity = '0';
            loader.style.transform = 'scale(0.9)';
            
            setTimeout(() => {
                loader.style.display = 'none';
            }, 800);
        }, 3500);
    }

    function onReady() {
        bindReportForm();
        bindAuthorityLogin();
        renderLeaderboard();
        renderMyReports();
        updateStats();
        initializeLoader();
        
        document.getElementById("year").textContent = new Date().getFullYear();

        // Auto-detect location if available
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const latInput = document.getElementById('lat');
                    const lngInput = document.getElementById('lng');
                    if (latInput && lngInput) {
                        latInput.value = position.coords.latitude.toFixed(6);
                        lngInput.value = position.coords.longitude.toFixed(6);
                        latInput.style.borderColor = 'var(--success)';
                        lngInput.style.borderColor = 'var(--success)';
                        
                        // Show location detected notification
                        setTimeout(() => {
                            showNotification('Location detected automatically!', 'success');
                        }, 1000);
                    }
                },
                () => {
                    // Geolocation failed, use default coordinates for Ahmedabad
                    const latInput = document.getElementById('lat');
                    const lngInput = document.getElementById('lng');
                    if (latInput && lngInput) {
                        latInput.placeholder = "23.0225 (Ahmedabad, India)";
                        lngInput.placeholder = "72.5714 (Ahmedabad, India)";
                    }
                }
            );
        }
    }

    document.addEventListener("DOMContentLoaded", onReady);

    return { 
        renderAuthority, 
        renderLeaderboard, 
        renderMyReports, 
        Store,
        showNotification 
    };
})();

// Enhanced Navigation System
const Navigation = (() => {
    let currentPage = 'home';

    function showPage(pageName) {
        // Hide all pages with fade out
        document.querySelectorAll('.page').forEach(page => {
            page.style.opacity = '0';
            page.style.transform = 'translateY(20px)';
            setTimeout(() => {
                page.classList.add('hidden');
            }, 300);
        });

        // Show selected page with fade in
        setTimeout(() => {
            const targetPage = document.getElementById(`${pageName}-page`);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                setTimeout(() => {
                    targetPage.style.opacity = '1';
                    targetPage.style.transform = 'translateY(0)';
                    targetPage.classList.add('fade-in');
                }, 50);
            }

            // Update navigation active state with smooth transition
            document.querySelectorAll('.nav-link').forEach(link => {
                link.classList.remove('active');
                link.style.transform = '';
            });
            
            const activeLink = document.querySelector(`[data-page="${pageName}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
                activeLink.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    activeLink.style.transform = '';
                }, 200);
            }

            // Update page-specific content
            switch(pageName) {
                case 'leaderboard':
                    MW.renderLeaderboard();
                    break;
                case 'myreports':
                    MW.renderMyReports();
                    break;
                case 'authority':
                    MW.renderAuthority();
                    break;
                case 'authority-login':
                    // Clear login form
                    setTimeout(() => {
                        const form = document.getElementById('authorityLoginForm');
                        if (form) form.reset();
                    }, 100);
                    break;
            }

            currentPage = pageName;
            closeMobileMenu();
        }, 300);

        // Smooth scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function toggleMobileMenu() {
        const navMenu = document.getElementById('navMenu');
        const mobileToggle = document.getElementById('mobileToggle');
        const icon = mobileToggle.querySelector('i');
        
        navMenu.classList.toggle('active');
        
        if (navMenu.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
            icon.style.transform = 'rotate(180deg)';
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
            icon.style.transform = 'rotate(0deg)';
        }
    }

    function closeMobileMenu() {
        const navMenu = document.getElementById('navMenu');
        const mobileToggle = document.getElementById('mobileToggle');
        const icon = mobileToggle.querySelector('i');
        
        navMenu.classList.remove('active');
        icon.classList.remove('fa-times');
        icon.classList.add('fa-bars');
        icon.style.transform = 'rotate(0deg)';
    }

    // Enhanced navbar scroll effect
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const navbar = document.getElementById('navbar');
        const currentScrollY = window.scrollY;
        
        if (currentScrollY > 100) {
            navbar.classList.add('scrolled');
            
            // Hide/show navbar based on scroll direction
            if (currentScrollY > lastScrollY && currentScrollY > 200) {
                navbar.style.transform = 'translateY(-100%)';
            } else {
                navbar.style.transform = 'translateY(0)';
            }
        } else {
            navbar.classList.remove('scrolled');
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollY = currentScrollY;
    });

    // Mobile menu toggle
    document.addEventListener('DOMContentLoaded', () => {
        const mobileToggle = document.getElementById('mobileToggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', toggleMobileMenu);
        }

        // Close mobile menu when clicking outside
        document.addEventListener('click', (e) => {
            const navMenu = document.getElementById('navMenu');
            const mobileToggle = document.getElementById('mobileToggle');
            
            if (navMenu && mobileToggle && 
                !navMenu.contains(e.target) && 
                !mobileToggle.contains(e.target)) {
                closeMobileMenu();
            }
        });

        // Add hover effects to interactive elements
        document.querySelectorAll('.card, .btn, .nav-link, .stat-card').forEach(element => {
            element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        });

        // Add ripple effect to buttons
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                const ripple = document.createElement('span');
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;
                
                ripple.style.cssText = `
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.4);
                    transform: scale(0);
                    animation: ripple 0.6s linear;
                    width: ${size}px;
                    height: ${size}px;
                    left: ${x}px;
                    top: ${y}px;
                    pointer-events: none;
                `;
                
                this.style.position = 'relative';
                this.style.overflow = 'hidden';
                this.appendChild(ripple);
                
                setTimeout(() => {
                    ripple.remove();
                }, 600);
            });
        });

        // Add CSS for ripple animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    });

    return { showPage };
})();

// Make showPage globally available
window.showPage = Navigation.showPage;

// Enhanced keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.altKey) {
        e.preventDefault();
        switch(e.key) {
            case '1':
                showPage('home');
                break;
            case '2':
                showPage('report');
                break;
            case '3':
                showPage('leaderboard');
                break;
            case '4':
                showPage('myreports');
                break;
            case '5':
                showPage('authority-login');
                break;
        }
    }
    
    // ESC key to close mobile menu
    if (e.key === 'Escape') {
        const navMenu = document.getElementById('navMenu');
        if (navMenu && navMenu.classList.contains('active')) {
            Navigation.closeMobileMenu();
        }
    }
});

// Performance optimization: Lazy load heavy content
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
        }
    });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.card, .stat-card').forEach(el => {
        observer.observe(el);
    });
});