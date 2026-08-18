        // =========================================================
        // ANALISADOR DE EDITAL COM IA — ADAPTIVE UNIVERSAL PARSER / V8
        // Estratégia adaptativa: PDF -> estrutura -> bloco/cargo -> matéria -> assunto.
        // A IA não pode inventar a hierarquia; fallback é validado contra o texto-fonte.
        // =========================================================
        let currentAiEditalAnalysis = null;
        let pdfJsAiLoadPromise = null;
        let aiEditalPdfCache = null;

        function setAiEditalStatus(message, isError = false) {
            const box = document.getElementById('aiEditalStatus');
            if (!box) return;
            box.textContent = message || '';
            box.classList.toggle('visible', !!message);
            box.style.borderColor = isError ? 'rgba(239,68,68,0.55)' : 'rgba(59,130,246,0.28)';
            box.style.background = isError ? 'rgba(239,68,68,0.10)' : 'rgba(59,130,246,0.10)';
        }

        function foldEditalText(text) {
            return String(text || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[–—]/g, '-')
                .replace(/\s+/g, ' ')
                .trim();
        }

        const PDF_JS_URL = './vendor/pdf.min.js';
        const PDF_JS_WORKER_URL = './vendor/pdf.worker.min.js';

        function loadPdfJsForAI() {
            if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
            if (pdfJsAiLoadPromise) return pdfJsAiLoadPromise;
            pdfJsAiLoadPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = PDF_JS_URL;
                script.async = true;
                script.onload = () => {
                    if (!window.pdfjsLib) return reject(new Error('PDF.js não foi inicializado.'));
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_URL;
                    resolve(window.pdfjsLib);
                };
                script.onerror = () => {
                    script.remove();
                    reject(new Error('Não foi possível carregar o leitor PDF.js do pacote do aplicativo. Conecte-se uma vez para preparar o cache offline e tente novamente.'));
                };
                document.head.appendChild(script);
            });
            return pdfJsAiLoadPromise;
        }

        function normalizeEditalPageText(text) {
            return String(text || '')
                .replace(/\u0000/g, ' ')
                .replace(/[ \t]+/g, ' ')
                .replace(/\s*\n\s*/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        function extractPdfPageTextWithLayout(items) {
            const tokens = (Array.isArray(items) ? items : [])
                .map((item, order) => {
                    const str = String(item?.str || '').replace(/\u0000/g, ' ').trim();
                    const transform = Array.isArray(item?.transform) ? item.transform : [];
                    const a = Number(transform[0]) || 0;
                    const b = Number(transform[1]) || 0;
                    const fontSize = Math.max(1, Math.sqrt((a * a) + (b * b)) || Math.abs(Number(transform[3])) || 10);
                    return {
                        str,
                        x: Number.isFinite(Number(transform[4])) ? Number(transform[4]) : 0,
                        y: Number.isFinite(Number(transform[5])) ? Number(transform[5]) : 0,
                        width: Math.max(0, Number(item?.width) || 0),
                        fontSize,
                        fontName: String(item?.fontName || ''),
                        order
                    };
                })
                .filter(t => t.str);

            if (!tokens.length) return { text: '', lines: [] };

            const tolerance = 2.8;
            const rawLines = [];
            for (const token of tokens) {
                let line = rawLines.find(l => Math.abs(l.y - token.y) <= tolerance);
                if (!line) {
                    line = { y: token.y, tokens: [] };
                    rawLines.push(line);
                }
                line.tokens.push(token);
            }

            rawLines.sort((a, b) => b.y - a.y);
            const lines = rawLines.map(line => {
                line.tokens.sort((a, b) => (a.x - b.x) || (a.order - b.order));
                let text = '';
                for (let ti=0; ti<line.tokens.length; ti++) {
                    const token=line.tokens[ti];
                    if (!ti) { text=token.str; continue; }
                    const prev=line.tokens[ti-1];
                    const prevEnd=(prev.x||0)+(prev.width||0);
                    const gap=(token.x||0)-prevEnd;
                    const tinyGap = Number.isFinite(gap) && gap <= Math.max(1.35, Math.min(prev.fontSize||10, token.fontSize||10) * .16);
                    const wordFragments = /[A-Za-zÀ-ÿ]$/.test(prev.str) && /^[A-Za-zÀ-ÿ]/.test(token.str);
                    // Alguns PDFs dividem a mesma palavra em vários text-items ("M" + "edicina",
                    // "Conhecim" + "entos"). Só preserva espaço quando existe distância gráfica real.
                    text += (tinyGap && wordFragments ? '' : ' ') + token.str;
                }
                text = text
                    .replace(/\s+([,.;:!?])/g, '$1')
                    .replace(/\(\s+/g, '(')
                    .replace(/\s+\)/g, ')')
                    .replace(/[ \t]{2,}/g, ' ')
                    .trim();
                const fontSize = line.tokens.reduce((m,t)=>Math.max(m,t.fontSize||0),0) || 10;
                const x = line.tokens.length ? Math.min(...line.tokens.map(t=>t.x)) : 0;
                const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
                const uppers = text.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g, '');
                const uppercaseRatio = letters.length ? uppers.length / letters.length : 0;
                const boldRatio = line.tokens.length ? line.tokens.filter(t => /bold|black|heavy|semibold/i.test(t.fontName)).length / line.tokens.length : 0;
                return { text, y: line.y, x, fontSize, uppercaseRatio, boldRatio };
            }).filter(l => l.text);

            const text = normalizeEditalPageText(lines.map(l=>l.text).join('\n'));
            return { text, lines };
        }

        function isPdfNoiseLine(line) {
            const f = foldEditalText(line);
            return !f ||
                /^diario da justica eletronico administrativo/.test(f) ||
                /^edicao:\s*\d+/.test(f) ||
                /^pagina \d+ de \d+$/.test(f) ||
                /^edital \d+\/\d+/.test(f);
        }

        function flattenPdfLines(pages) {
            const out = [];
            pages.forEach(p => {
                const sourceLines = Array.isArray(p.lines) && p.lines.length
                    ? p.lines
                    : String(p.text || '').split(/\n+/).map(text => ({ text }));
                sourceLines.forEach((raw, lineInPage) => {
                    const text = String(raw?.text ?? raw ?? '').trim();
                    if (!text || isPdfNoiseLine(text)) return;
                    out.push({
                        text,
                        pageNumber: p.pageNumber,
                        lineInPage,
                        x: Number(raw?.x) || 0,
                        y: Number(raw?.y) || 0,
                        fontSize: Number(raw?.fontSize) || 10,
                        uppercaseRatio: Number(raw?.uppercaseRatio) || 0,
                        boldRatio: Number(raw?.boldRatio) || 0
                    });
                });
            });
            return out;
        }

        // =========================================================
        // UNIVERSAL PARSER V8 — ADAPTIVE STRUCTURE ENGINE
        // Baseado em padrões reais de FCC, FGV, IDECAN, Cebraspe,
        // Consulpam, Vunesp, AOCP e IBFC, sem regras exclusivas por banca.
        // A lista abaixo é somente pista lexical: headings desconhecidos
        // continuam sendo detectados por layout/estrutura.
        // =========================================================
        const AI_DISCIPLINE_NAMES = [
            'Língua Portuguesa','Português','Redação','Raciocínio Lógico-Matemático','Raciocínio Lógico','Raciocínio Lógico Quantitativo','Matemática','Matemática e Raciocínio Lógico',
            'Noções de Informática','Informática','Noções Básicas de Informática','Tecnologia da Informação','Tecnologia da Informação e Segurança Cibernética',
            'Atualidades','Conhecimentos Gerais','Conhecimentos Regionais','Conhecimentos sobre o Município','Realidade Étnica, Social, Histórica, Geográfica, Cultural, Política e Econômica',
            'Noções sobre Direitos das Pessoas com Deficiência','Direitos das Pessoas com Deficiência','Direitos Humanos','Noções de Direitos Humanos','Ética no Serviço Público',
            'Legislação','Legislação Geral','Legislação Institucional','Legislação Estadual e Institucional','Legislação Penal Especial','Legislação Penal e Processual Penal Extravagante',
            'Direito Constitucional','Direito Administrativo','Direito Administrativo e Gestão Pública','Direito Civil','Direito Processual Civil','Direito Penal','Direito Processual Penal',
            'Noções de Direito Constitucional','Noções de Direito Administrativo','Noções de Direito Civil','Noções de Direito Processual Civil','Noções de Direito Penal','Noções de Direito Processual Penal',
            'Direito do Trabalho','Direito Processual do Trabalho','Direito Tributário','Direito Financeiro','Direito Previdenciário','Direito Eleitoral','Direito Empresarial','Direito Ambiental',
            'Administração Pública','Noções de Administração Pública','Administração Geral','Noções de Administração','Noções de Administração/Situações Gerenciais','Gestão Pública','Gestão de Pessoas','Língua Portuguesa e Redação Oficial','Legislação Aplicada ao Sistema CFA/CRAs','Ética e Administração Pública','Saúde Pública','Inglês Técnico Marítimo',
            'Contabilidade Geral','Contabilidade Aplicada ao Setor Público','Contabilidade Tributária','Contabilidade','Auditoria','Noções de Auditoria Governamental','Administração Orçamentária e Financeira',
            'Arquivologia','Estatística','Economia','Organização Judiciária','Medicina Legal','Ciências Forenses','Conhecimentos Técnicos',
            'Promoção da Igualdade Racial e de Gênero','Segurança da Informação','Infraestrutura de TI e Redes','Computação em Nuvem','Administração de Sistemas e Plataformas',
            'Banco de Dados','Programação','Redes de Computadores','Sistemas Operacionais','DevOps e DevSecOps','Arquitetura de Sistemas','Desenvolvimento de Aplicações Web e Mobile','Gestão e Governança de Tecnologia da Informação'
        ];

        const GENERIC_SCOPE_WORDS = new Set([
            'conhecimentos gerais','conhecimentos basicos','conhecimentos básicos','conhecimentos comuns','conhecimentos especificos','conhecimentos específicos',
            'conteudo programatico','conteúdo programático','conteudos programaticos','conteúdos programáticos','programa das provas','programa de provas','objetos de avaliacao','objetos de avaliação'
        ]);

        function titleCaseLoose(value) {
            const raw = String(value || '').replace(/\s+/g,' ').trim();
            if (!raw) return raw;
            if (raw !== raw.toLocaleUpperCase('pt-BR')) return raw;
            const small = new Set(['de','da','do','das','dos','e','em','para','com']);
            return raw.toLocaleLowerCase('pt-BR').split(' ').map((w,i)=>{
                if (i && small.has(w)) return w;
                return w ? w[0].toLocaleUpperCase('pt-BR') + w.slice(1) : w;
            }).join(' ');
        }

        function stripSectionNumber(value) {
            return String(value || '').replace(/^\s*(?:\d+(?:\.\d+)*[.)-]?|[IVXLCDM]+[.)-])\s+/i,'').trim();
        }

        function findKnownDisciplineAtStart(line) {
            const raw = stripSectionNumber(String(line || '').trim());
            const folded = foldEditalText(raw);
            if (!folded) return null;
            let best = null;
            for (const name of AI_DISCIPLINE_NAMES) {
                const f = foldEditalText(name);
                if (folded === f || folded.startsWith(f + ':') || folded.startsWith(f + ' -') || folded.startsWith(f + ' (')) {
                    if (!best || f.length > best.folded.length) best = { name, folded:f };
                }
            }
            if (!best) return null;
            let remainder = raw.slice(best.folded.length).trim();
            if (remainder.startsWith('(')) {
                const colon = remainder.indexOf(':');
                remainder = colon >= 0 ? remainder.slice(colon + 1).trim() : '';
            } else remainder = remainder.replace(/^\s*[:\-–—]\s*/,'').trim();
            return { name: best.name, remainder };
        }

        function canonicalCargoLabel(code, rawLabel) {
            const label = titleCaseLoose(String(rawLabel || '').replace(/\s+/g,' ').trim().replace(/[–—-]+$/g,'').trim()) || 'Bloco específico';
            return code ? `${code} – ${label}` : label;
        }


        function cleanCargoDisplayName(cargo) {
            const code = String(cargo?.code || '').trim();
            let raw = String(cargo?.rawLabel || cargo?.label || '').replace(/\s+/g,' ').trim();
            if (!raw) return code || 'Cargo';

            // Remove código que já tenha sido incorporado ao label interno.
            if (code && code !== '__FULL__') {
                const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                raw = raw.replace(new RegExp('^' + escaped + '\s*[–—-]\s*', 'i'), '').trim();
            }

            // Remove numeração estrutural que pode anteceder o cargo (2.1, 20.2.4.2.10 etc.).
            raw = raw.replace(/^\s*[.·•-]*\s*\d+(?:\.\d+)*\s*[.)-]?\s*/,'').trim();

            // Formatos explícitos de especialidade: ex. ESPECIALIDADE: AGENTE SOCIAL (CARGO 200).
            const esp = raw.match(/\bESPECIALIDADE\s*:\s*(.+?)(?=\s*\(\s*CARGO\b|$)/i);
            if (esp?.[1]) raw = esp[1].trim();

            // Formatos com trilha + separador: "... (TDAS) – – Técnico Administrativo".
            const dashParts = raw.split(/\s+[–—]\s+/).map(v=>v.replace(/^[-–—\s]+|[-–—\s]+$/g,'').trim()).filter(Boolean);
            if (dashParts.length >= 2) {
                const last = dashParts[dashParts.length - 1];
                // Prefere o último segmento quando ele não é apenas nível/código/metadado.
                if (last && !/^(nível|nivel|cargo|código|codigo|conhecimentos?|programa|prova)\b/i.test(last)) raw = last;
            }

            // IADES/Fundatec e similares: ADMINISTRADOR – NÍVEL SUPERIOR (CÓDIGO 101).
            raw = raw
                .replace(/\s*[–—-]\s*N[IÍ]VEL\s+(?:SUPERIOR|M[EÉ]DIO|FUNDAMENTAL).*$/i,'')
                .replace(/\s*\(\s*C[ÓO]DIGO\s*\d+\s*\)\s*$/i,'')
                .replace(/\s*\(\s*CARGO\s*\d+\s*\)\s*$/i,'')
                .replace(/^\s*(?:CARGO|FUNÇÃO|FUNCAO)\s*\d*\s*[:–—-]\s*/i,'')
                .replace(/^\s*CARGOS?\s+[0-9\s,E\/A-]+\s*:\s*/i,'')
                .replace(/\s+/g,' ')
                .trim();

            if (!raw || isMetaRoleLabel(raw)) raw = String(cargo?.rawLabel || cargo?.label || 'Cargo').trim();
            return titleCaseLoose(raw);
        }

        function cargoSelectLabel(cargo) {
            const name = cleanCargoDisplayName(cargo);
            const internalCode = String(cargo?.code || '').trim();
            const publishedCode = String(cargo?.publishedCode || '').trim();
            const code = publishedCode || internalCode;
            if (!code || internalCode === '__FULL__' || /^BL\d+$/i.test(internalCode)) return name;
            return `${code} — ${name}`;
        }

        function hashEditalText(value) {
            let h = 2166136261;
            const text = String(value || '');
            for (let i=0;i<text.length;i++){ h ^= text.charCodeAt(i); h = Math.imul(h,16777619); }
            return h >>> 0;
        }

        function roleSignal(text) {
            return /(delegad[oa]|agente|escriv[aã]o|papiloscopista|analista|t[eé]cnico|auditor|assistente|oficial|soldado|pra[cç]a|capel[aã]o|especialista|professor|docente|m[eé]dico|enfermeir[oa]|engenheir[oa]|psic[oó]log[oa]|contador|advogad[oa]|procurador|perito|nutricionista|dentista|auxiliar|fiscal|inspetor|censit[aá]rio|administrador|administrativo|secret[aá]ri[oa]|motorista|operador|eletricista|mec[aâ]nico|cozinheir[oa]|taifeiro|mo[cç]o|condutor|pintor|rasteleiro|farmac[eê]utico|fisioterapeuta|veterin[aá]ri[oa]|pedagog[oa]|soci[oó]log[oa]|bi[oó]log[oa]|agrimensura|servi[cç]o social|comunica[cç][aã]o social|ci[eê]ncias cont[aá]beis|economia|estat[ií]stica)/i.test(String(text||''));
        }

        function normalizeEducationLevel(text) {
            const f = foldEditalText(text);
            if (/nivel fundamental|ensino fundamental/.test(f)) return 'fundamental';
            if (/nivel medio|ensino medio|ensino médio/.test(f)) return 'medio';
            if (/nivel superior|ensino superior|graduacao|graduação|bacharelado|licenciatura/.test(f)) return 'superior';
            return '';
        }

        function findProgramStartIndex(lines) {
            const aliases = [
                'conteudo programatico','conteudos programaticos','conteudo das provas','conteudos das provas','programa das provas','programa de provas','programa da prova',
                'dos conteudos programaticos','dos conteúdos programáticos','objetos de avaliacao','dos objetos de avaliacao','objetos de avaliação','dos objetos de avaliação','programas - prova base','programas - conhecimentos especificos','programas – prova base','programas – conhecimentos específicos','habilidades e conhecimentos','ementas','ementa'
            ];
            let best=-1,bestScore=-1;
            for (let i=0;i<lines.length;i++) {
                const raw=String(lines[i].text||'').trim();
                const f=foldEditalText(raw); let score=0;
                for (const a of aliases) {
                    const af=foldEditalText(a);
                    if (f===af) score=Math.max(score,18); // heading canônico
                    else if (f.startsWith(af) && f.length<110) score=Math.max(score,14);
                    else if (f.includes(af) && f.length<150) score=Math.max(score,8); // mera referência no corpo
                }
                // Referências como “conteúdo programático constante do Anexo B” não são início do conteúdo.
                if (/(constante|conforme|previsto|indicado)\s+(?:no|na|do|da)?\s*[“"']?anexo\b/.test(f) || /conteudo programatico constante/.test(f)) score -= 7;
                // Heading de ANEXO imediatamente antes/depois do marcador recebe forte bônus.
                const prev=foldEditalText(lines[i-1]?.text||''), next=foldEditalText(lines[i+1]?.text||'');
                if (/^anexo\s+[a-zivxlcdm\d]+\b/.test(prev) || /^anexo\s+[a-zivxlcdm\d]+\b/.test(f)) score += 8;
                if (/^anexo\s+[a-zivxlcdm\d]+\b/.test(next)) score += 3;
                if (/^\d+(?:\.\d+)*\s+dos objetos de avaliacao/.test(f)) score = Math.max(score,15);
                if ((lines[i].uppercaseRatio||0)>.7) score += 2;
                // Se logo após o marcador há headings de disciplina, trata-se quase certamente do bloco real.
                let disciplineLookahead=0;
                for (let j=i+1;j<Math.min(lines.length,i+12);j++) {
                    const t=String(lines[j]?.text||'').trim();
                    if (!t) continue;
                    if (findKnownDisciplineAtStart(stripSectionNumber(t))) disciplineLookahead++;
                    else {
                        const letters=t.replace(/[^A-Za-zÀ-ÿ]/g,''), uppers=t.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
                        const ratio=letters.length?uppers.length/letters.length:0;
                        if (ratio>.82 && t.split(/\s+/).length<=10 && !/[.;!?]$/.test(t)) disciplineLookahead++;
                    }
                }
                if (disciplineLookahead>=1) score += 5;
                if (disciplineLookahead>=2) score += 5;
                if (score>0) score += Math.min(2, i/Math.max(1,lines.length)*2);
                if (score>bestScore){bestScore=score;best=i;}
            }
            if (bestScore>=10) return best;
            for (let i=Math.floor(lines.length*.35);i<lines.length;i++) {
                const f=foldEditalText(lines[i].text);
                if (/^(conhecimentos|disciplinas|materias)\b/.test(f)) return Math.max(0,i-1);
            }
            return -1;
        }

        function sanitizeSingleRoleCandidate(value) {
            let raw=String(value||'').replace(/\s+/g,' ').trim();
            if (!raw) return '';

            // V9.13: o nome do cargo deve ser um sintagma nominal, nunca a frase administrativa
            // inteira onde ele apareceu. Essas regras são semânticas e independentes de banca.
            raw=raw
                .replace(/^\s*(?:cargo|emprego|fun[cç][aã]o)\s+(?:p[uú]blico\s+)?(?:inicial\s+)?(?:de\s+)?/i,'')
                .replace(/^\s*(?:inicial|efetivo|efetiva|de\s+provimento\s+efetivo)\s+de\s+/i,'')
                .replace(/\s*,?\s+(?:por\s+meio\s+de|mediante|atrav[eé]s\s+de)\s+(?:concurso|processo\s+seletivo)\b.*$/i,'')
                .replace(/\s+(?:do|da|de)\s+quadro\b.*$/i,'')
                .replace(/\s+(?:da|do)\s+carreira\b.*$/i,'')
                .replace(/\s+(?:é|e)\s+de\s+R\$.*$/i,'')
                .replace(/\s+(?:com|cuja|cujo)\s+(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga\s+hor[aá]ria|lota[cç][aã]o|vagas?)\b.*$/i,'')
                .replace(/\s+(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga\s+hor[aá]ria|lota[cç][aã]o)\s*[:=-].*$/i,'')
                .replace(/\s+(?:que|o qual|a qual)\s+(?:ser[aá]|ter[aá]|possui|receber[aá]|exercer[aá])\b.*$/i,'')
                .replace(/\s+e\s+estabelece\b.*$/i,'')
                .replace(/[,:;\-–—]+$/,'')
                .trim();

            // Normaliza hífen quebrado pelo PDF.js sem destruir travessões semânticos longos.
            raw=raw.replace(/([A-Za-zÀ-ÿ])\s+-\s+([A-Za-zÀ-ÿ])/g,'$1-$2');

            const f=foldEditalText(raw);
            if (isAdministrativeRoleFragment(raw)) return '';
            if (/R\$|\b(?:remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|carga\s+hor[aá]ria|jornada|lota[cç][aã]o)\b/i.test(raw)) return '';
            if (/\b(?:por meio de|mediante concurso|concurso publico de provas|processo seletivo|sera|serao|visando ao|destinado a)\b/.test(f)) return '';
            if ((raw.match(/\d/g)||[]).length>5) return '';
            if (raw.length<3 || raw.length>105 || raw.split(/\s+/).length>14) return '';
            return raw;
        }

        function inferSingleRoleFromPreamble(lines, programStart) {
            const limit=Math.min(programStart>0?programStart:lines.length, Math.max(320, Math.floor(lines.length*.30)));
            const candidates=[];

            const pushCandidate=(value,index,score,source)=>{
                const cleaned=sanitizeSingleRoleCandidate(value);
                if (!cleaned || isMetaRoleLabel(cleaned) || findKnownDisciplineAtStart(cleaned)) return;
                candidates.push({label:titleCaseLoose(cleaned),index,score,source});
            };

            // PDF costuma quebrar uma única frase em 2–4 linhas. Reconstruímos janelas curtas
            // antes de aplicar a gramática de cargo, mantendo a posição de origem para ranking.
            const windows=[];
            for(let i=0;i<limit;i++){
                let text='';
                for(let span=1;span<=4 && i+span<=limit;span++){
                    const part=String(lines[i+span-1]?.text||'').replace(/\s+/g,' ').trim();
                    if(!part) continue;
                    text=(text+' '+part).trim();
                    if(text.length>620) break;
                    windows.push({text,index:i,span});
                }
            }

            for (const w of windows) {
                const raw=w.text;
                if (!raw || raw.length>620) continue;
                const f=foldEditalText(raw);

                // Objeto/finalidade do certame: fonte mais confiável para um cargo único.
                // Ex.: "visando ao provimento de 2.000 (...) cargos de Aluno-Soldado PM do Quadro..."
                let m=raw.match(/\b(?:provimento|preenchimento)\b.{0,260}?\bcargos?\s+de\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|\s*,?\s+(?:por\s+meio\s+de|mediante)\b|[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,14,'objeto-provimento');

                m=raw.match(/\b(?:concurso|processo\s+seletivo)\b.{0,220}?\b(?:destinad[oa]s?|visando|objetiva|para)\b.{0,220}?\bcargos?\s+de\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|\s*,?\s+(?:por\s+meio\s+de|mediante)\b|[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,12,'objeto-certame');

                m=raw.match(/\b(?:vagas?|oportunidades?)\s+(?:destinad[oa]s?\s+)?(?:para|ao)\s+(?:o\s+)?(?:cargo|emprego|fun[cç][aã]o)\s+de\s+(.+?)(?=[,.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,11,'vagas-para');

                m=raw.match(/\b(?:selecionar|sele[cç][aã]o\s+de)\s+candidatos.{0,180}?\b(?:cargo|cargos|fun[cç][aã]o|fun[cç][oõ]es)\s+(?:de\s+)?(.+?)(?=[.;]|$)/i);
                if (m) pushCandidate(m[1],w.index,10,'selecao-candidatos');

                // Cabeçalhos explícitos têm alta precisão mesmo fora do preâmbulo narrativo.
                m=raw.match(/^\s*(?:CARGO|FUN[CÇ][AÃ]O|EMPREGO)\s*(?:\d+)?\s*[:–—-]\s*(.+)$/i);
                if (m) pushCandidate(m[1],w.index,10,'heading');

                // Fallback: aceita "cargo inicial de X", mas a sanitização remove o modificador
                // "inicial de" e qualquer cauda administrativa. Baixa prioridade por desenho.
                if (!/(remunera[cç][aã]o|sal[aá]rio|vencimento|subs[ií]dio|jornada|carga horaria|lota[cç][aã]o|valor\s+de|R\$)/i.test(f)) {
                    m=raw.match(/\b(?:cargo|fun[cç][aã]o|emprego)\s+(.+?)(?=\s+(?:do|da)\s+(?:quadro|carreira)\b|[.;]|$)/i);
                    if (m) pushCandidate(m[1],w.index,4,'fallback-cargo');
                }
            }
            if (!candidates.length) return null;

            // Agrupa equivalentes e favorece o sintagma nominal mais curto quando uma versão
            // longa contém a curta (evita "Aluno-Soldado PM, por meio de...").
            const normalized=c=>foldEditalText(c.label).replace(/[^a-z0-9]+/g,' ').trim();
            const grouped=new Map();
            for (const c of candidates) {
                const k=normalized(c); if (!k) continue;
                const g=grouped.get(k)||{...c,count:0,totalScore:0,bestScore:0};
                g.count++; g.totalScore+=c.score; g.bestScore=Math.max(g.bestScore,c.score);
                if (c.score>g.score || (c.score===g.score && c.label.length<g.label.length)) Object.assign(g,{label:c.label,index:c.index,score:c.score,source:c.source});
                grouped.set(k,g);
            }
            let ranked=[...grouped.values()];
            for(const a of ranked){
                const ka=normalized(a);
                for(const b of ranked){
                    if(a===b) continue;
                    const kb=normalized(b);
                    if(kb.length>=5 && ka!==kb && ka.includes(kb) && b.bestScore>=a.bestScore-2){
                        b.totalScore+=Math.max(1,a.bestScore*.35); b.count+=1;
                    }
                }
            }
            ranked.sort((a,b)=>(b.bestScore-a.bestScore)||(b.totalScore-a.totalScore)||(b.count-a.count)||(a.label.length-b.label.length)||(a.index-b.index));
            const top=ranked[0];
            if (!top || top.bestScore<4) return null;
            const confidence=top.bestScore>=13?.995:top.bestScore>=10?.98:top.bestScore>=7?.94:top.count>1?.88:.80;
            return {code:`BL${hashEditalText(top.label)%10000}`,label:top.label,rawLabel:top.label,confidence,segments:[],educationLevel:'',synthetic:true,singleRole:true,sourceType:top.source};
        }

        function isProgramAnnexHeadingAt(lines, i) {
            const f=foldEditalText(lines[i]?.text||'');
            if(!/^anexo\s+[a-zivxlcdm\d]+\b/.test(f)) return false;
            const window=lines.slice(i,Math.min(lines.length,i+5)).map(x=>foldEditalText(x.text)).join(' ');
            return /(conteudo|programa|conhecimento|objeto de avaliacao|prova base)/.test(window);
        }

        function findProgramEndIndex(lines, start) {
            if (start<0) return lines.length;
            let startAnnex='';
            for (let i=Math.max(0,start-2);i<=start;i++) {
                const m=foldEditalText(lines[i]?.text).match(/^anexo\s+([a-zivxlcdm\d]+)/);
                if (m) startAnnex=m[1];
            }
            for (let i=start+8;i<lines.length;i++) {
                const f=foldEditalText(lines[i].text);
                const m=f.match(/^anexo\s+([a-zivxlcdm\d]+)\b/);
                if (m && (!startAnnex || m[1]!==startAnnex)) {
                    // Anexos consecutivos também podem compor o programa (ex.: prova-base + específicos).
                    if (isProgramAnnexHeadingAt(lines,i)) continue;
                    return i;
                }
                if (/^(cronograma|calendario|calendário)\b/.test(f) && i>start+30) return i;
            }
            return lines.length;
        }

        function isProgramBlockHeading(text) {
            const f=foldEditalText(stripSectionNumber(text));
            return /^(conhecimentos|conteudos)\s+(gerais|basicos|comuns|especificos)\b/.test(f) ||
                   /^prova de conhecimentos?\s+(gerais|especificos)/.test(f) ||
                   /^parte\s+(geral|especifica)/.test(f) ||
                   /^conhecimentos comuns para todos os cargos/.test(f) || /^conhecimentos para todos os cargos/.test(f) || /^conhecimentos especificos do cargo/.test(f) || /^conhecimentos especificos comuns as especialidades/.test(f);
        }

        function extractCargoFamilyKey(text) {
            const raw=String(text||'');
            let m=raw.match(/\((TDAS|EDAS|[A-Z]{2,8})\)/i);
            if(m) return m[1].toUpperCase();
            m=raw.match(/CARGO\s+(.+?)(?:\(|$)/i);
            return m ? foldEditalText(m[1]).slice(0,80) : '';
        }

        function classifyBlockHeading(text) {
            const raw=stripSectionNumber(String(text||'').replace(/\s+/g,' ').trim());
            const f=foldEditalText(raw);
            if (!isProgramBlockHeading(raw)) return null;
            const kind=/(especific|específic)/i.test(raw)?'specific':'common';
            const level=normalizeEducationLevel(raw);
            const all=/(todos os cargos|para todos os cargos|comuns para todos)/.test(f);
            const familyKey=(/especific/.test(f) && /(do cargo|especialidades do cargo)/.test(f)) ? extractCargoFamilyKey(raw) : '';
            const familyCommon=!!familyKey && /(comuns?\s+(?:a|as|às)\s+especialidades|especificos do cargo)/.test(f);
            return {kind,level,all,raw,familyKey,familyCommon};
        }

        function parseInlineCargoBlockHeading(item) {
            const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
            // FCC: CONHECIMENTOS BÁSICOS/ESPECÍFICOS para o cargo A01 – ...
            let m=raw.match(/CONHECIMENTOS\s+(B[ÁA]SICOS|GERAIS|ESPEC[ÍI]FICOS).*?(?:PARA\s+O\s+CARGO|PARA)\s+([A-Z]{1,4}\d{1,4}|\d{2,4}[A-Z]?)\s*[–—-]\s*(.+)$/i);
            if (m) return { kind:/espec/i.test(m[1])?'specific':'common', code:m[2].toUpperCase(), publishedCode:m[2].toUpperCase(), label:m[3].trim(), confidence:.99 };

            // Selecon e similares: CONHECIMENTOS ESPECÍFICOS – AGENTE ...
            m=raw.match(/^CONHECIMENTOS\s+ESPEC[ÍI]FICOS\s*[–—:-]\s*(.+)$/i);
            if(m && !/^(DO CARGO|COMUNS? ÀS|POR ESPECIALIDADE)/i.test(m[1])) {
                const label=m[1].trim();
                return {kind:'specific',code:`BL${hashEditalText(label)%10000}`,label,confidence:.99};
            }

            // Cebraspe: específicos para os cargos de AGENTE ... E ESCRIVÃO ...
            m=raw.match(/CONHECIMENTOS\s+ESPEC[ÍI]FICOS\s+PARA\s+OS?\s+CARGOS?\s+DE\s+(.+)$/i);
            if (m) return {kind:'specific', code:`GR${hashEditalText(m[1])%10000}`, label:m[1].trim(), confidence:.96, group:true};

            // Fundatec: CARGOS 01 E 02: ADMINISTRAÇÃO / CARGO 06: ENGENHARIA...
            m=raw.match(/^CARGOS?\s+([0-9]{1,3}(?:\s*(?:,|E|\/|A)\s*[0-9]{1,3})*)\s*:\s*(.+)$/i);
            if(m){
                const nums=[...m[1].matchAll(/\d+/g)].map(x=>x[0].padStart(2,'0'));
                const code=nums.length?`C${nums.join('_')}`:`BL${hashEditalText(m[2])%10000}`;
                return {kind:'specific',code,publishedCode:nums.join('/'),label:m[2].trim(),confidence:.99,codes:nums};
            }

            // Quadrix: ... ESPECIALIDADE: AGENTE SOCIAL (CARGO 200): primeiro tópico...
            m=raw.match(/^(.*?)ESPECIALIDADE\s*:\s*(.+?)\s*\(CARGO\s*(\d+)\)\s*:\s*(.*)$/i);
            if(m){
                const prefix=m[1].replace(/^\d+(?:\.\d+)*\s*/,'').trim();
                const label=(prefix?`${prefix} – `:'')+m[2].trim();
                return {kind:'specific',code:`C${m[3]}`,publishedCode:m[3],label,confidence:.995,inlineRemainder:m[4].trim(),familyKey:extractCargoFamilyKey(prefix)};
            }

            // IADES e similares: ADMINISTRADOR – NÍVEL SUPERIOR (CÓDIGO 101)
            m=stripSectionNumber(raw).match(/^(.+?)\s*[–—-]\s*N[ÍI]VEL\s+(?:M[ÉE]DIO|SUPERIOR|FUNDAMENTAL)\s*\(C[ÓO]DIGO\s*(\d+)\)\s*:?(.*)$/i);
            if(m){
                return {kind:'specific',code:`C${m[2]}`,publishedCode:m[2],label:m[1].trim(),confidence:.995,inlineRemainder:m[3].trim()};
            }

            return null;
        }

        function isMetaRoleLabel(text) {
            const f=foldEditalText(String(text||'').replace(/[_–—-]+/g,' ').replace(/\s+/g,' ').trim());
            const compact=f.replace(/\s+/g,'');
            if (!f) return true;

            const forbiddenCompact = [
                'nivelsuperior','nivelsuperiorcompleto','nivelmedio','nivelmediocompleto',
                'nivelfundamental','ensinomedio','ensinosuperior','ensinofundamental',
                'conhecimentosespecificos','conhecimentosgerais','conhecimentosbasicos',
                'conhecimentoscomuns','conteudoprogramatico','conteudosprogramaticos',
                'programa','programas','provabase','provaobjetiva','disciplinas',
                'materias','todososcargos','cargostodos'
            ];
            if (forbiddenCompact.some(x=>compact===x || compact.startsWith(x))) return true;

            if (/^(nivel|ensino)\s+(superior|medio|fundamental)\b/.test(f)) return true;
            if (/^(conhecimentos?|conteudos?|programas?|prova|parte|anexo|capitulo|secao)\b/.test(f)) return true;
            if (/^(cargos?\s*:\s*todos|cargos?\s+todos|todos\s+os\s+cargos)\b/.test(f)) return true;
            if (/^(parte\s*\d+|parte\s+(geral|especifica))$/.test(f)) return true;
            return false;
        }

        function looksLikeRoleHeading(item, perCargoContext=false) {
            const source=String(item?.text||'').replace(/\s+/g,' ').trim();
            const raw=stripSectionNumber(source).replace(/:$/,'').trim();
            if (!raw || raw.length<3 || raw.length>105) return false;
            if (isMetaRoleLabel(raw)) return false;
            if (findKnownDisciplineAtStart(raw)) return false;
            const f=foldEditalText(raw);
            if (/^(cargo|cargos|funcao|area|especialidade)$/.test(f)) return false;
            if (/^[0-9]+(?:\.[0-9]+)+/.test(source)) return false;
            if (/[.;]\s+/.test(raw) || (raw.match(/:/g)||[]).length>0) return false;
            const words=raw.split(/\s+/).filter(Boolean);
            if (words.length>11) return false;
            const letters=raw.replace(/[^A-Za-zÀ-ÿ]/g,'');
            const uppers=raw.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
            const upperRatio=letters.length?uppers.length/letters.length:(item?.uppercaseRatio||0);
            const strongVisual = upperRatio>=.78 || (item?.uppercaseRatio||0)>=.78 || (item?.boldRatio||0)>=.58;
            const lexicalRole = roleSignal(raw);
            if (perCargoContext) return strongVisual;
            return lexicalRole && strongVisual;
        }

        function inferEducationLevelForRole(lines, roleLabel, programStart) {
            const candidates=String(roleLabel||'').replace(/\([^)]*\)/g,'').split(/\s+E\s+|\s*\/\s*/i).map(v=>foldEditalText(v)).filter(v=>v.length>4);
            let best='';
            for (let i=0;i<programStart;i++) {
                const f=foldEditalText(lines[i].text);
                if (!candidates.some(c=>f.includes(c) || c.includes(f))) continue;
                const win=lines.slice(Math.max(0,i-8),Math.min(programStart,i+14)).map(x=>x.text).join(' ');
                const level=normalizeEducationLevel(win);
                if (level) return level;
                if (/diploma|gradua[cç][aã]o|bacharel|licenciatura/i.test(win)) best='superior';
            }
            return best;
        }

        function parseCargoAudienceDirective(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            const m=raw.match(/^CARGOS?\s*:\s*(.+)$/i);
            if(!m) return null;
            const names=m[1].split(/\s*\/\s*|\s*;\s*/).map(v=>v.trim()).filter(Boolean);
            return names.length ? names : null;
        }

        function cargoMatchesAudience(cargo, audience) {
            if(!audience || !audience.length) return true;
            const labels=[cargo?.rawLabel,cargo?.label].filter(Boolean).map(foldEditalText);
            return audience.some(a=>{
                const fa=foldEditalText(a);
                return labels.some(l=>l.includes(fa)||fa.includes(l.replace(/^c\d+\s*-\s*/,'')));
            });
        }

        function filterLinesByCargoAudience(lines,cargo) {
            let audience=null;
            const out=[];
            for(const item of lines){
                const dir=parseCargoAudienceDirective(item.text);
                if(dir){ audience=dir; continue; }
                if(cargoMatchesAudience(cargo,audience)) out.push(item);
            }
            return out;
        }

        function isAdministrativeRoleFragment(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            const f=foldEditalText(raw);
            if(!raw) return true;
            if(/R\$|\b\d{1,3}\s*h\/s\b|\b\d+\s*\+?\s*CR\b/i.test(raw)) return true;
            if(/\b(?:constantes?|previstos?|descritos?|discriminados?)\s+(?:do|no)\s+item\b/.test(f)) return true;
            if(/\b(?:deste|do presente)\s+edital\b/.test(f) && /\b(?:compreendera|compreenderao|etapas?|cargos?)\b/.test(f)) return true;
            if(/\b(?:compreendera|compreenderao|consistira|consistirao|serao submetidos|será submetido|sera submetido)\b/.test(f)) return true;
            if(/^(?:cargo|cargos|escolaridade|requisitos?|jornada|remuneracao|vagas?|total de vagas|cadastro de reserva)\b/.test(f)) return true;
            if(/\b(?:prova objetiva|provas objetivas|prova pratica|provas praticas|carater eliminatorio|carater classificatorio)\b/.test(f)) return true;
            return false;
        }

        function isLikelyRoleNameFragment(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim().replace(/[:;,.]+$/,'');
            if(!raw || raw.length<3 || raw.length>90) return false;
            if(isAdministrativeRoleFragment(raw) || isMetaRoleLabel(raw) || findKnownDisciplineAtStart(raw)) return false;
            const f=foldEditalText(raw);
            if(/^(?:ensino|nivel|experiencia|comprovacao|registro|curso|formacao|cn[h]?|pagina|realizacao|edital|concurso publico|ampla concorrencia|pessoas com deficiencia)\b/.test(f)) return false;
            if(/[.!?]/.test(raw)) return false;
            if((raw.match(/\d/g)||[]).length>2) return false;
            if(raw.split(/\s+/).length>12) return false;
            // Frases narrativas normalmente possuem verbos; nomes de cargo, em regra, não.
            if(/\b(?:sera|serao|devera|deverao|compreende|compreendera|consiste|destina|destina-se|realiza|realizado|possui|exige|atuara|executa|auxilia|dirige|maneja|opera)\b/i.test(f)) return false;
            return true;
        }

        function findRoleTableRanges(lines, programStart) {
            const ranges=[];
            let start=-1;
            for(let i=0;i<programStart;i++){
                const f=foldEditalText(lines[i]?.text||'');
                const marker = /(dos cargos.*(?:escolaridade|pre-requisitos|requisitos|quadro de vagas)|quadro de cargos|quadro de vagas|cargo\s+escolaridade|cargos,?\s+escolaridade)/.test(f);
                if(marker && start<0){ start=i; continue; }
                if(start>=0 && i>start+3){
                    // novo capítulo numerado encerra a tabela, salvo cabeçalhos internos da própria tabela.
                    if(/^\d+(?:\.\d+)?\s*[.)-]?\s+(?:dos|das|da|de)\s+/.test(f) && !/(cargos|vagas|escolaridade|requisitos)/.test(f)){
                        ranges.push({start,end:i}); start=-1;
                    }
                }
            }
            if(start>=0) ranges.push({start,end:programStart});
            return ranges;
        }

        function detectRoleTableGeometry(lines, range) {
            const roles=[];
            const pages=[...new Set(lines.slice(range.start,range.end).map(x=>x.pageNumber).filter(Boolean))];

            const cleanCellText=(parts)=>String((parts||[]).join(' '))
                .replace(/\s+/g,' ')
                .replace(/\s+([,.;:])/g,'$1')
                .trim()
                .replace(/[:;,.-]+$/,'')
                .trim();

            const isRequirementAnchor=(item)=>{
                const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                const f=foldEditalText(raw);
                if(!raw) return false;
                if(/^(?:escolaridade|requisitos?|jornada|remuneracao|vagas?)\b/.test(f)) return false;
                return /^(?:ensino|nivel|formacao|graduacao|curso\b|diploma\b|registro\b)/.test(f) ||
                       /^(?:fundamental|medio|superior)\b/.test(f);
            };

            const isMoneyAnchor=(item)=>/R\$\s*[\d.]+,\d{2}/i.test(String(item?.text||''));

            for(const pageNumber of pages){
                const pageIndexes=[];
                for(let i=range.start;i<range.end;i++) if(lines[i]?.pageNumber===pageNumber) pageIndexes.push(i);
                if(!pageIndexes.length) continue;

                // Localiza a geometria da tabela a partir dos próprios cabeçalhos de coluna.
                let cargoHeader=-1, reqHeader=-1;
                for(const idx of pageIndexes){
                    const f=foldEditalText(lines[idx]?.text||'');
                    if(cargoHeader<0 && /^cargo\b/.test(f)) cargoHeader=idx;
                    if(reqHeader<0 && /^(?:escolaridade|requisitos?)\b/.test(f)) reqHeader=idx;
                }
                if(cargoHeader<0) continue;

                const cargoX=Number(lines[cargoHeader]?.x)||0;
                let reqX=reqHeader>=0 ? Number(lines[reqHeader]?.x)||0 : 0;
                if(!(reqX>cargoX+18)){
                    // Cabeçalhos quebrados podem esconder ESCOLARIDADE. Procura a primeira coluna
                    // textual consistente à direita do CARGO.
                    const xs=pageIndexes
                        .map(i=>Number(lines[i]?.x)||0)
                        .filter(x=>x>cargoX+45)
                        .sort((a,b)=>a-b);
                    reqX=xs.length?xs[0]:0;
                }
                if(!(reqX>cargoX+18)) continue;

                const cargoRight=cargoX + (reqX-cargoX)*0.50;
                const headerY=Number(lines[cargoHeader]?.y)||0;
                const pageItems=pageIndexes.map(i=>({i,item:lines[i]}));

                // Âncoras de linha: preferimos a primeira informação da coluna de requisitos;
                // se o edital não tiver escolaridade, remuneração serve como segunda opção.
                let anchors=pageItems.filter(({i,item})=>{
                    if(i===reqHeader) return false;
                    const x=Number(item?.x)||0;
                    if(x<cargoRight) return false;
                    return isRequirementAnchor(item);
                });
                if(anchors.length<2){
                    anchors=pageItems.filter(({item})=>{
                        const x=Number(item?.x)||0;
                        return x>cargoRight && isMoneyAnchor(item);
                    });
                }
                if(!anchors.length) continue;

                // Remove âncoras duplicadas muito próximas na mesma linha/célula.
                anchors.sort((a,b)=>(Number(b.item.y)||0)-(Number(a.item.y)||0));
                const dedup=[];
                for(const a of anchors){
                    if(dedup.some(d=>Math.abs((Number(d.item.y)||0)-(Number(a.item.y)||0))<7)) continue;
                    dedup.push(a);
                }
                anchors=dedup;
                if(!anchors.length) continue;

                const cargoCandidates=pageItems.filter(({i,item})=>{
                    if(i===cargoHeader) return false;
                    const x=Number(item?.x)||0;
                    const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                    const f=foldEditalText(raw);
                    if(!raw || x>cargoRight) return false;
                    if(/^(?:cargo|total de vagas|ac\s*=|nota explicativa|concurso publico|edital|realizacao|pagina)\b/.test(f)) return false;
                    if(isAdministrativeRoleFragment(raw) || isMetaRoleLabel(raw)) return false;
                    return true;
                });

                // Cada âncora representa uma linha da tabela. Usamos os pontos médios entre
                // âncoras para criar bandas Y e recolher APENAS texto da coluna CARGO.
                for(let ai=0;ai<anchors.length;ai++){
                    const ay=Number(anchors[ai].item.y)||0;
                    const prevY=ai===0 ? headerY : Number(anchors[ai-1].item.y)||0;
                    let nextY;
                    if(ai+1<anchors.length) nextY=Number(anchors[ai+1].item.y)||0;
                    else {
                        const ys=cargoCandidates.map(c=>Number(c.item.y)||0).filter(y=>y<ay);
                        nextY=ys.length ? Math.min(...ys)-24 : ay-70;
                    }
                    const upper=(prevY+ay)/2;
                    const lower=(ay+nextY)/2;
                    const hi=Math.max(upper,lower), lo=Math.min(upper,lower);
                    const row=cargoCandidates
                        .filter(c=>{ const y=Number(c.item.y)||0; return y<=hi+4 && y>=lo-4; })
                        .sort((a,b)=>(Number(b.item.y)||0)-(Number(a.item.y)||0) || (Number(a.item.x)||0)-(Number(b.item.x)||0));
                    const label=cleanCellText(row.map(c=>c.item.text));
                    if(!label || !isLikelyRoleNameFragment(label)) continue;
                    roles.push({label:titleCaseLoose(label),index:row[0]?.i??anchors[ai].i,confidence:.995,pageNumber,sourceType:'role-table-geometry'});
                }
            }
            return roles;
        }

        function detectRoleCatalogBeforeProgram(lines, programStart) {
            const found=new Map();
            const addRole=(label, idx, confidence=.9, educationLevel='', sourceType='role-table')=>{
                let clean=String(label||'').replace(/\s+/g,' ').trim().replace(/[:;,.-]+$/,'').trim();
                if(!isLikelyRoleNameFragment(clean)) return;
                clean=titleCaseLoose(clean);
                const key=foldEditalText(clean.replace(/\([^)]*\)/g,'')).replace(/[^a-z0-9]+/g,' ').trim();
                if(!key || key.length<3) return;
                const current=found.get(key);
                const obj={code:`BL${hashEditalText(clean)%10000}`,label:clean,rawLabel:clean,confidence,segments:[],educationLevel:educationLevel||inferEducationLevelForRole(lines,clean,programStart),synthetic:false,catalogOnly:true,sourceType};
                if(!current || confidence>current.confidence) found.set(key,obj);
            };

            const ranges=findRoleTableRanges(lines,programStart);

            // 1) Fonte primária: geometria real das tabelas. Isso impede que texto das colunas
            // ESCOLARIDADE/JORNADA/REMUNERAÇÃO seja confundido com nomes de cargo.
            let geometryHits=0;
            for(const range of ranges){
                const geometric=detectRoleTableGeometry(lines,range);
                for(const r of geometric){ addRole(r.label,r.index,r.confidence,'',r.sourceType); geometryHits++; }
            }

            // 2) Fallback textual conservador SOMENTE quando não houve geometria utilizável.
            // Aceita formatos lineares como "101 - ADMINISTRADOR", mas não tenta reconstruir
            // células de tabela a partir de fragmentos vizinhos.
            if(geometryHits===0){
                for(const range of ranges){
                    for(let i=range.start+1;i<range.end;i++){
                        const raw=String(lines[i]?.text||'').replace(/\s+/g,' ').trim();
                        const f=foldEditalText(raw);
                        if(!raw || isAdministrativeRoleFragment(raw)) continue;
                        let m=raw.match(/^([A-Z]{0,3}\d{1,4}|\d{1,4})\s*[-–—]\s*(.{3,75})$/i);
                        if(m && isLikelyRoleNameFragment(m[2])){
                            const code=/^[A-Z]/i.test(m[1])?m[1].toUpperCase():`C${m[1]}`;
                            const label=titleCaseLoose(m[2]);
                            const key=foldEditalText(label).replace(/[^a-z0-9]+/g,' ').trim();
                            found.set(key,{code,label,rawLabel:label,confidence:.97,segments:[],educationLevel:inferEducationLevelForRole(lines,label,programStart),synthetic:false,catalogOnly:true,sourceType:'role-table-code'});
                            continue;
                        }
                        // Só aceita linha autônoma quando há evidência visual forte e um sinal lexical de cargo.
                        if(roleSignal(raw) && looksLikeRoleHeading(lines[i],false) && isLikelyRoleNameFragment(raw)) addRole(raw,i,.78,'','role-table-heading');
                    }
                }
            }

            // 3) Evidência independente: headings do anexo de atribuições podem validar e
            // complementar catálogos quando o quadro inicial é difícil de extrair.
            if(found.size<2){
                let inDuties=false;
                for(let i=0;i<programStart;i++){
                    const raw=String(lines[i]?.text||'').replace(/\s+/g,' ').trim();
                    const f=foldEditalText(raw);
                    if(/^anexo\s+[a-zivxlcdm\d]+.*atribui[cç][oõ]es.*cargos?/.test(f)){ inDuties=true; continue; }
                    if(inDuties && /^anexo\s+[a-zivxlcdm\d]+/.test(f)) break;
                    if(!inDuties || !raw || raw.length>80) continue;
                    const strong=(lines[i]?.boldRatio||0)>=.45 || (lines[i]?.uppercaseRatio||0)>=.65;
                    if(strong && isLikelyRoleNameFragment(raw)) addRole(raw,i,.84,'','duties-heading');
                }
            }
            return [...found.values()];
        }

        function buildScopeModel(lines, programStart, programEnd) {
            const events=[];
            let inPerCargoSpecific=false;

            const hasExplicitRoleMarkers = lines.slice(programStart+1, programEnd).some((item)=>{
                const raw=String(item?.text||'').replace(/\s+/g,' ').trim();
                if (!raw) return false;
                if (parseInlineCargoBlockHeading(item)) return true;
                return /^(?:CARGO|FUNÇÃO|FUNCAO)\s*(?:\d+)?\s*[:\-–—]/i.test(raw) ||
                       /^CARGOS?\s+[0-9]{1,3}(?:\s*(?:,|E|\/|A)\s*[0-9]{1,3})*\s*:/i.test(raw);
            });

            for (let i=programStart+1;i<programEnd;i++) {
                const item=lines[i], raw=String(item.text||'').trim(), f=foldEditalText(raw);
                if (!raw) continue;
                const inline=parseInlineCargoBlockHeading(item);
                if (inline){ events.push({type:'cargo-block',index:i,...inline}); continue; }
                const block=classifyBlockHeading(raw);
                if (block) {
                    if (/para cada cargos?|para cada cargo/.test(f)) inPerCargoSpecific=true;
                    events.push({type:'block',index:i,...block});
                    continue;
                }
                if (/^cargo\s*[:\-–—]\s*/i.test(raw)) {
                    const label=raw.replace(/^cargo\s*[:\-–—]\s*/i,'').trim();
                    events.push({type:'role',index:i,code:`BL${hashEditalText(label)%10000}`,label,confidence:.98});
                    inPerCargoSpecific=true;
                    continue;
                }
                // CARGO 1: ... / FUNÇÃO 1: ...
                let m=raw.match(/^(?:CARGO|FUNÇÃO|FUNCAO)\s*(\d+)?\s*[:\-–—]\s*(.+)$/i);
                if (m) {
                    events.push({type:'role',index:i,code:m[1]?`C${m[1]}`:`BL${hashEditalText(m[2])%10000}`,publishedCode:m[1]||'',label:m[2].trim(),confidence:.98});
                    inPerCargoSpecific=true;
                    continue;
                }
                // Headings autônomos só são necessários quando o edital NÃO traz marcadores explícitos
                // CARGO/CARGOS/CÓDIGO no próprio programa.
                if (!hasExplicitRoleMarkers && looksLikeRoleHeading(item, inPerCargoSpecific)) {
                    events.push({type:'role',index:i,code:`BL${hashEditalText(raw)%10000}`,label:raw.replace(/:$/,'').trim(),confidence:inPerCargoSpecific?.92:.82});
                }
            }

            events.sort((a,b)=>a.index-b.index);
            const shared=[];
            const firstSpecificEvent=events.find(e=>e.type==='role'||e.type==='cargo-block');
            if(firstSpecificEvent && firstSpecificEvent.index>programStart+1){
                shared.push({start:programStart+1,end:firstSpecificEvent.index,kind:'common',level:'',event:{type:'implicit-common',index:programStart}});
            }
            const scopeMap=new Map();
            const ensure=(code,label,confidence=.8,publishedCode='')=>{
                const key=code||`BL${hashEditalText(label)%10000}`;
                if(!scopeMap.has(key)) scopeMap.set(key,{code:key,publishedCode:String(publishedCode||'').trim(),label:canonicalCargoLabel(code&&/^([A-Z]{1,4}\d+)/.test(code)?code:'',label),rawLabel:label,confidence,segments:[],educationLevel:'',synthetic:false});
                else if (publishedCode && !scopeMap.get(key).publishedCode) scopeMap.get(key).publishedCode=String(publishedCode).trim();
                return scopeMap.get(key);
            };

            for (let ei=0;ei<events.length;ei++) {
                const ev=events[ei], end=ei+1<events.length?events[ei+1].index:programEnd;
                const range={start:ev.index+1,end,kind:ev.kind||'specific',level:ev.level||'',familyKey:ev.familyKey||'',familyCommon:!!ev.familyCommon,event:ev};
                if (ev.type==='cargo-block') {
                    const sc=ensure(ev.code,ev.label,ev.confidence,ev.publishedCode||''); sc.segments.push(range); if(!sc.educationLevel) sc.educationLevel=inferEducationLevelForRole(lines,ev.label,programStart);
                } else if (ev.type==='role') {
                    const sc=ensure(ev.code,ev.label,ev.confidence,ev.publishedCode||''); sc.segments.push({...range,kind:'specific'}); if(!sc.educationLevel) sc.educationLevel=inferEducationLevelForRole(lines,ev.label,programStart);
                } else if (ev.type==='block') {
                    // bloco comum geral/por nível é compartilhado; bloco específico sem cargo fica compartilhado até surgir cargo.
                    shared.push(range);
                }
            }

            // Se não há cargo dentro do programa, usa catálogo do quadro de cargos quando disponível.
            if (!scopeMap.size) {
                const catalog=detectRoleCatalogBeforeProgram(lines,programStart);
                if(catalog.length>1){
                    for(const sc of catalog){
                        sc.segments=[{start:programStart+1,end:programEnd,kind:'specific',level:''}];
                        scopeMap.set(sc.code,sc);
                    }
                } else {
                    const preambleFold=foldEditalText(lines.slice(0,programStart).map(x=>x.text).join(' '));
                    const clearlyPlural=/\b(?:cargos constantes|dos cargos|quadro de cargos|cargos,? escolaridade|cargos previstos|cada cargo|todos os cargos)\b/.test(preambleFold);
                    const single=clearlyPlural ? null : (inferSingleRoleFromPreamble(lines,programStart) || catalog[0]);
                    if (single && Number(single.confidence||0)>=.88) {
                        single.segments=[{start:programStart+1,end:programEnd,kind:'specific',level:''}];
                        scopeMap.set(single.code,single);
                    } else {
                        scopeMap.set('__FULL__',{code:'__FULL__',label:clearlyPlural?'Todos os cargos — conteúdo comum':'Conteúdo programático (bloco único)',rawLabel:clearlyPlural?'Todos os cargos':'Conteúdo programático',confidence:clearlyPlural?.86:.94,segments:[{start:programStart+1,end:programEnd,kind:'specific',level:''}],educationLevel:'',synthetic:true,multiRoleUnresolved:clearlyPlural});
                    }
                }
            }

            // Remove falsos cargos que são headings evidentemente de disciplinas.
            for (const [k,sc] of [...scopeMap]) {
                if (findKnownDisciplineAtStart(sc.rawLabel) || GENERIC_SCOPE_WORDS.has(foldEditalText(sc.rawLabel))) scopeMap.delete(k);
            }
            if (!scopeMap.size) scopeMap.set('__FULL__',{code:'__FULL__',label:'Conteúdo programático (bloco único)',rawLabel:'Conteúdo programático',confidence:.9,segments:[{start:programStart+1,end:programEnd,kind:'specific',level:''}],educationLevel:'',synthetic:true});
            return {scopes:[...scopeMap.values()],shared,events};
        }

        function isGenericProgramBoundary(line) {
            const f=foldEditalText(stripSectionNumber(line));
            return /^(conhecimentos|conteudos)\s+(gerais|basicos|comuns|especificos)\b/.test(f) ||
                /^prova de conhecimentos?\s+(gerais|especificos)/.test(f) ||
                /^anexo\s+[ivxlcdm\d]+\b/.test(f) || /^cronograma\b/.test(f) || /^cargo\s*[:\-]/.test(f);
        }

        function editalHeadingScore(head, meta={}, hasColon=false) {
            const raw=String(head||'').trim(), f=foldEditalText(raw);
            if(!raw||raw.length<3||raw.length>145) return 0;
            if(GENERIC_SCOPE_WORDS.has(f)) return 0;
            if(/^(observacao|anexo|conteudo|conhecimentos|cargo|area|especialidade|edital|capitulo|secao|prova|cronograma)$/i.test(f)) return 0;
            if(roleSignal(raw) && looksLikeRoleHeading({...meta,text:raw})) return 0;
            let score=0;
            const letters=raw.replace(/[^A-Za-zÀ-ÿ]/g,''), uppers=raw.replace(/[^A-ZÁÉÍÓÚÂÊÔÃÕÇ]/g,'');
            const upperRatio=letters.length?uppers.length/letters.length:(meta.uppercaseRatio||0);
            if(hasColon) score+=3;
            if(upperRatio>.78&&letters.length>=4) score+=4; else if(upperRatio>.52) score+=2;
            if((meta.boldRatio||0)>.35) score+=2;
            if((meta.fontSize||10)>=11.5) score+=1;
            if(/^(no[cç][oõ]es|direito|lingua|língua|raciocinio|raciocínio|matematica|matemática|contabilidade|administracao|administração|informatica|informática|tecnologia|engenharia|psicologia|servico social|estatistica|economia|auditoria|arquivologia|legislacao|medicina|ciencias|ciências|atualidades|etica|ética|promo[cç][aã]o)/i.test(raw)) score+=2;
            if(raw.split(/\s+/).length<=12) score+=1;
            return score;
        }

        function detectGenericDisciplineHeader(item) {
            const line=String(item?.text??item??'').replace(/\s+/g,' ').trim();
            if(!line) return null;
            const numbered=line.match(/^\s*(\d+(?:\.\d+)*)[.)]?\s+/);
            const sectionDepth=numbered ? numbered[1].split('.').length : 0;
            const stripped=stripSectionNumber(line);
            const known=findKnownDisciplineAtStart(stripped);
            if(known) return {name:known.name,remainder:known.remainder,confidence:.99,method:'lexical-hint',sectionDepth,hasSectionNumber:sectionDepth>0};
            if(isGenericProgramBoundary(line)) return null;
            const colon=stripped.indexOf(':');
            if(colon>=3&&colon<=145){
                const head=stripped.slice(0,colon).trim(); const score=editalHeadingScore(head,item,true);
                if(score>=5) return {name:titleCaseLoose(head),remainder:stripped.slice(colon+1).trim(),confidence:Math.min(.98,.58+score*.05),method:'colon-heading',sectionDepth,hasSectionNumber:sectionDepth>0};
            }
            const fullScore=editalHeadingScore(stripped,item,false);
            if(stripped.length<=120&&fullScore>=7&&!/[.;!?]$/.test(stripped)) return {name:titleCaseLoose(stripped),remainder:'',confidence:Math.min(.95,.55+fullScore*.05),method:'visual-heading',sectionDepth,hasSectionNumber:sectionDepth>0};
            // Numerado + título em caixa alta, muito comum Vunesp/FGV: 1. HISTÓRIA GERAL
            if(/^\d+(?:\.\d+)*[.)]?\s+/.test(line)) {
                const t=stripSectionNumber(line); const score=editalHeadingScore(t,item,false);
                if(score>=6 && t.length<100 && !/[.;!?]$/.test(t)) return {name:titleCaseLoose(t),remainder:'',confidence:.9,method:'numbered-heading',sectionDepth,hasSectionNumber:true};
            }
            return null;
        }

        function splitProgramTopics(body) {
            let text=String(body||'').replace(/\u00ad/g,'').replace(/\s+/g,' ').trim();
            if(!text) return [];
            // hierarquia 1 / 1.1 / 1.1.1 — preserva o texto de cada nó como assunto.
            text=text.replace(/(^|\s)(\d+(?:\.\d+)*)(?:\.|\))?\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/g,'$1§TOPIC§ ');
            // bullets e alíneas
            text=text.replace(/\s+[•▪●]\s+/g,'§TOPIC§ ').replace(/\s+([a-z])\)\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g,'§TOPIC§ ');
            // ponto final é fallback, sem quebrar abreviações simples/números.
            text=text.replace(/([!?]|\.(?!\d))\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g,'$1§TOPIC§ ');
            const raw=text.split('§TOPIC§').map(v=>v.trim().replace(/^[;:,\-–—\s]+/,'').replace(/[.\s]+$/,'').trim()).filter(v=>v.length>=3);
            const topics=[],seen=new Set();
            for(let topic of raw){
                if(topic.length>900&&topic.includes(';')){
                    const pieces=topic.split(/\s*;\s*/).map(v=>v.trim()).filter(v=>v.length>=3);
                    if(pieces.length>1){ for(const piece of pieces){const k=foldEditalText(piece);if(!seen.has(k)){seen.add(k);topics.push(piece)}} continue; }
                }
                const k=foldEditalText(topic); if(!seen.has(k)){seen.add(k);topics.push(topic)}
            }
            return topics;
        }

        function isBareStructuralSectionNumber(text) {
            // Numeração de capítulo/subcapítulo extraída sozinha pelo PDF.js, por exemplo
            // "20.2.2" ou "20.2.4.1.3". Isso é metadado estrutural, nunca assunto.
            return /^\s*\d+(?:\.\d+){1,7}\.?\s*$/.test(String(text||''));
        }

        function stripAudiencePrefixFromProgramLine(text) {
            const raw=String(text||'').replace(/\s+/g,' ').trim();
            // Quadrix/Selecon/Fundatec e similares podem quebrar o heading e jogar
            // "(PARA TODOS OS CARGOS):" na linha seguinte. O escopo não é assunto.
            return raw.replace(/^\(\s*(?:PARA\s+)?TODOS\s+OS\s+CARGOS(?:\/OCUPA[CÇ][OÕ]ES)?\s*\)\s*:\s*/i,'').trim();
        }

        function normalizeDisciplineIdentity(text) {
            return foldEditalText(stripSectionNumber(String(text||'')))
                .replace(/\([^)]*\)/g,' ')
                .replace(/\b(?:disciplina|materia|prova de|questoes?|peso)\b/g,' ')
                .replace(/[^a-z0-9]+/g,' ')
                .replace(/\s+/g,' ').trim();
        }

        function disciplineIdentityMatches(a,b) {
            const A=normalizeDisciplineIdentity(a), B=normalizeDisciplineIdentity(b);
            if(!A||!B) return false;
            if(A===B) return true;
            if(A.length>=6 && B.length>=6 && (A.includes(B)||B.includes(A))) return true;
            const stop=new Set(['de','da','do','das','dos','e','em','para','no','na','nos','nas','com','nocao','nocoes']);
            const ta=new Set(A.split(' ').filter(x=>x.length>2&&!stop.has(x)));
            const tb=new Set(B.split(' ').filter(x=>x.length>2&&!stop.has(x)));
            if(!ta.size||!tb.size) return false;
            let inter=0; for(const x of ta) if(tb.has(x)) inter++;
            const min=Math.min(ta.size,tb.size), union=new Set([...ta,...tb]).size;
            return inter/min>=.67 || inter/union>=.58;
        }

        function detectExamDisciplineRegistry(lines, programStart) {
            const found=[];
            const seen=new Set();
            const add=(name,confidence=.9,source='exam-composition')=>{
                let raw=String(name||'').replace(/\s+/g,' ').replace(/[;,:.\-–—]+$/,'').trim();
                raw=stripSectionNumber(raw).trim();
                if(!raw||raw.length<3||raw.length>130||isMetaRoleLabel(raw)||roleSignal(raw)||isGenericProgramBoundary(raw)) return;
                const f=normalizeDisciplineIdentity(raw); if(!f||seen.has(f)) return;
                // Cabeçalhos administrativos/etapas não são disciplinas.
                if(/^(prova objetiva|prova discursiva|prova dissertativa|redacao|total|etapa|fase|conteudo programatico|conhecimentos)$/.test(f)) return;
                seen.add(f); found.push({name:titleCaseLoose(raw),key:f,confidence,source});
            };
            const before=lines.slice(0,Math.max(0,programStart));
            for(let i=0;i<before.length;i++){
                const raw=String(before[i]?.text||'').replace(/\s+/g,' ').trim();
                if(!raw||raw.length>240) continue;
                const ctx=foldEditalText(before.slice(Math.max(0,i-7),Math.min(before.length,i+8)).map(x=>x.text).join(' '));
                if(!/(prova objetiva|numero de questoes|número de questões|questoes de multipla escolha|disciplinas|conteudo programatico|composicao da prova)/.test(ctx)) continue;

                // Lista declarativa: "1.1.1. Língua Portuguesa ... - 20 (vinte);"
                let stripped=stripSectionNumber(raw);
                let m=stripped.match(/^(.{3,125}?)\s*[-–—]\s*\d{1,3}\s*(?:\([^)]*\))?\s*[;.]?$/i);
                if(m) { add(m[1],.99,'exam-list'); continue; }

                // Tabelas: nome da disciplina seguido de colunas numéricas (qtd/peso/pontos).
                // Alguns PDFs acrescentam na mesma linha células vizinhas como "Todos Objetiva"
                // antes da disciplina e "classificatório" depois dos números.
                m=stripped.match(/^(.{3,135}?)\s+(\d{1,3})(?:\s+[0-9]+(?:[.,][0-9]+)?){1,4}(?:\s+(?:eliminat[oó]rio|classificat[oó]rio|e))*\s*$/i);
                if(m) {
                    let tableName=m[1]
                        .replace(/^(?:todos(?:\s+os\s+cargos)?|n[ií]vel\s+(?:m[eé]dio|superior))\s+/i,'')
                        .replace(/^(?:objetiva|discursiva|reda[cç][aã]o)\s+/i,'')
                        .trim();
                    add(tableName,.97,'exam-table'); continue;
                }

                // Variante "Disciplina: 20 questões".
                m=stripped.match(/^(.{3,110}?)\s*[:–—-]\s*\d{1,3}\s+quest(?:ão|ões|oes)\b/i);
                if(m) { add(m[1],.97,'exam-count'); continue; }
            }
            // Só bloqueia a hierarquia se houver evidência de uma composição real com 2+ disciplinas.
            return found.length>=2 && found.length<=40 ? found : [];
        }

        function matchRegistryDiscipline(name, registry) {
            if(!Array.isArray(registry)||!registry.length) return null;
            let best=null,score=0;
            for(const r of registry){
                if(!disciplineIdentityMatches(name,r.name)) continue;
                const A=normalizeDisciplineIdentity(name),B=normalizeDisciplineIdentity(r.name);
                let s=A===B?1:(A.includes(B)||B.includes(A))?.92:.78;
                if(s>score){score=s;best=r;}
            }
            return best ? {...best,matchScore:score} : null;
        }

        function parseDisciplineSections(lines, fallbackMateria, weight=1, priority=2, registry=[]) {
            const sections=[]; let current=null;
            const registryLocked=Array.isArray(registry)&&registry.length>=2;
            const flush=()=>{
                if(!current)return;
                const body=current.lines.map(x=>x.text||x).join(' ').trim();
                const assuntos=splitProgramTopics(body);
                if(assuntos.length) sections.push({materia:current.name,prioridade:priority,peso:weight,assuntos,confidence:current.confidence||.55,detectionMethod:current.method||'fallback',sourcePages:[...new Set(current.lines.map(x=>x.pageNumber).filter(Boolean))]});
                current=null;
            };
            for(let i=0;i<lines.length;i++){
                const item=lines[i];
                let line=String(item?.text??item??'').trim();
                if(!line||isPdfNoiseLine(line)) continue;
                if(isBareStructuralSectionNumber(line)) continue;

                const scopeStripped=stripAudiencePrefixFromProgramLine(line);
                if(scopeStripped!==line){
                    if(!scopeStripped) continue;
                    line=scopeStripped;
                }

                let heading=detectGenericDisciplineHeader(typeof item==='object'?{...item,text:line}:line);
                let registryMatch=heading ? matchRegistryDiscipline(heading.name,registry) : null;
                if(heading && registryLocked && registryMatch){
                    heading={...heading,name:registryMatch.name,confidence:Math.max(heading.confidence||.7,registryMatch.confidence||.9),method:`registry-${registryMatch.source}`};
                }

                if(heading && current && heading.hasSectionNumber && Number(heading.sectionDepth||0) > Number(current.sectionDepth||0) && !registryMatch){
                    heading=null;
                }

                if(heading){
                    flush();
                    current={name:heading.name,lines:[],confidence:heading.confidence,method:heading.method,sectionDepth:Number(heading.sectionDepth||0)};
                    if(heading.remainder) current.lines.push({text:heading.remainder,pageNumber:item?.pageNumber});
                    continue;
                }

                if(isGenericProgramBoundary(line)) continue;
                if(looksLikeRoleHeading({...item,text:line}) && !findKnownDisciplineAtStart(line)) continue;
                if(!current) current={name:fallbackMateria,lines:[],confidence:.48,method:'fallback-block',sectionDepth:0};
                current.lines.push(typeof item==='object'?{...item,text:line}:{text:line});
            }
            flush();
            return sections;
        }

        function auditVerticalizedExtraction(materias, selectedLines, registry=[]) {
            const warnings=[];
            const names=(materias||[]).map(m=>normalizeDisciplineIdentity(m.materia));
            const explicit=[];
            for(const item of (selectedLines||[])){
                const line=String(item?.text??item??'').trim();
                if(!line||isPdfNoiseLine(line)) continue;
                const h=detectGenericDisciplineHeader(typeof item==='object'?item:line);
                if(!h) continue;
                const key=normalizeDisciplineIdentity(h.name);
                if(key && !explicit.some(x=>x.key===key)) explicit.push({key,name:h.name});
            }
            for(const h of explicit){
                if(!names.some(n=>disciplineIdentityMatches(n,h.key))) warnings.push(`Disciplina explícita não verticalizada: ${h.name}`);
            }
            if(Array.isArray(registry)&&registry.length>=2){
                for(const r of registry){
                    if(!names.some(n=>disciplineIdentityMatches(n,r.name))) warnings.push(`Disciplina do quadro da prova não localizada no programa: ${r.name}`);
                }
            }
            return [...new Set(warnings)].slice(0,12);
        }

        function mergeMaterias(materias) {
            const map=new Map();
            for(const mat of materias){
                const name=String(mat.materia||'').trim(); if(!name)continue; const key=foldEditalText(name);
                if(!map.has(key)) map.set(key,{materia:name,prioridade:mat.prioridade||2,peso:Number(mat.peso)||1,assuntos:[],confidence:Number(mat.confidence)||.5,detectionMethod:mat.detectionMethod||'',sourcePages:[]});
                const t=map.get(key); t.prioridade=Math.min(t.prioridade,mat.prioridade||2); t.peso=Math.max(t.peso,Number(mat.peso)||1); t.confidence=Math.max(t.confidence,Number(mat.confidence)||.5); t.sourcePages=[...new Set([...(t.sourcePages||[]),...((mat.sourcePages||[]).filter(Boolean))])].sort((a,b)=>a-b);
                const seen=new Set(t.assuntos.map(foldEditalText)); for(const ass of(mat.assuntos||[])){const a=String(ass||'').trim(),k=foldEditalText(a);if(a&&!seen.has(k)){seen.add(k);t.assuntos.push(a)}}
            }
            return [...map.values()].filter(m=>m.assuntos.length);
        }

        function detectExamWeights(lines,cargoCode,programStart) {
            const before=lines.slice(0,Math.max(0,programStart)); let idx=-1;
            if(cargoCode && cargoCode!=='__FULL__') for(let i=0;i<before.length;i++) if(foldEditalText(before[i].text).includes(foldEditalText(cargoCode))) idx=i;
            const pool=idx>=0?before.slice(Math.max(0,idx-8),Math.min(before.length,idx+34)):before.slice(Math.max(0,before.length-450));
            const f=foldEditalText(pool.map(x=>x.text).join(' '));
            let m=f.match(/conhecimentos (?:gerais|basicos)\s+conhecimentos especificos\s+(\d+)\s+(\d+)\s+([0-9]+(?:[.,][0-9]+)?)\s+([0-9]+(?:[.,][0-9]+)?)/);
            if(m) return {generalQuestions:Number(m[1]),specificQuestions:Number(m[2]),generalWeight:Number(m[3].replace(',','.'))||1,specificWeight:Number(m[4].replace(',','.'))||1};
            // Consulpam e outros: valor da questão comum; mantém peso relativo neutro quando não há peso explícito.
            return {generalWeight:1,specificWeight:1,generalQuestions:null,specificQuestions:null};
        }

        async function loadAiPdfStructure(blob,fileKey='') {
            const cacheKey=`${fileKey}|${blob?.size||0}|${blob?.lastModified||0}`;
            if(aiEditalPdfCache?.key===cacheKey) return aiEditalPdfCache;
            const pdfjs=await loadPdfJsForAI(); const bytes=new Uint8Array(await blob.arrayBuffer()); const pdf=await pdfjs.getDocument({data:bytes}).promise; const pages=[];
            for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
                setAiEditalStatus(`Lendo PDF e construindo o mapa estrutural: página ${pageNumber} de ${pdf.numPages}...`);
                const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),layout=extractPdfPageTextWithLayout(content.items);
                pages.push({pageNumber,text:layout.text,lines:layout.lines.map(l=>({...l,pageNumber}))});
            }
            const chars=pages.reduce((sum,p)=>sum+p.text.length,0); if(chars<800) throw new Error('O PDF parece ser digitalizado como imagem ou não possui texto pesquisável.');
            const lines=flattenPdfLines(pages),programStart=findProgramStartIndex(lines); if(programStart<0) throw new Error('Não foi localizada uma seção de conteúdo programático/objetos de avaliação no PDF.');
            const programEnd=findProgramEndIndex(lines,programStart),model=buildScopeModel(lines,programStart,programEnd);
            aiEditalPdfCache={key:cacheKey,pages,lines,programStart,programEnd,totalPages:pdf.numPages,cargos:model.scopes,sharedSegments:model.shared,events:model.events};
            return aiEditalPdfCache;
        }

        function segmentLines(structure,seg){
            const rows=structure.lines.slice(Math.max(structure.programStart+1,seg.start),Math.min(structure.programEnd,seg.end));
            const rem=String(seg?.event?.inlineRemainder||'').trim();
            if(rem) rows.unshift({text:rem,pageNumber:structure.lines[seg.event.index]?.pageNumber||0,fontSize:10,uppercaseRatio:0,boldRatio:0,x:0,y:0,synthetic:true});
            return rows;
        }

        function sharedSegmentsForScope(structure,scope) {
            const common=(structure.sharedSegments||[]).filter(seg=>{
                if(seg.kind!=='common' && !seg.familyCommon) return false;
                if(seg.level && scope.educationLevel && seg.level!==scope.educationLevel) return false;
                if(seg.familyKey){
                    const target=foldEditalText(`${scope.rawLabel||''} ${scope.label||''}`);
                    if(!target.includes(foldEditalText(seg.familyKey))) return false;
                }
                return true;
            });
            return common;
        }

        function buildSelectedCargoExtraction(structure,cargoCode) {
            const cargo=structure.cargos.find(c=>c.code===cargoCode); if(!cargo) throw new Error('Selecione um bloco/cargo válido antes de analisar.');
            const weights=detectExamWeights(structure.lines,cargo.code,structure.programStart);
            const commonSegs=sharedSegmentsForScope(structure,cargo);
            const ownCommon=(cargo.segments||[]).filter(s=>s.kind==='common');
            const ownSpecific=(cargo.segments||[]).filter(s=>s.kind!=='common');
            let generalLines=[...commonSegs,...ownCommon].flatMap(seg=>segmentLines(structure,seg));
            let specificLines=ownSpecific.flatMap(seg=>segmentLines(structure,seg));
            generalLines=filterLinesByCargoAudience(generalLines,cargo);
            specificLines=filterLinesByCargoAudience(specificLines,cargo);

            // Bloco único: não duplica conteúdo como geral/específico.
            if(cargo.synthetic){ generalLines=[]; specificLines=(cargo.segments||[]).flatMap(seg=>segmentLines(structure,seg)); }
            // Se um cargo foi detectado mas seu bloco específico ficou vazio, usa somente o intervalo do próprio cargo.
            if(!specificLines.length && !cargo.synthetic) specificLines=(cargo.segments||[]).flatMap(seg=>segmentLines(structure,seg));

            const disciplineRegistry=detectExamDisciplineRegistry(structure.lines,structure.programStart);
            let generalMaterias=parseDisciplineSections(generalLines,'Conhecimentos Gerais',weights.generalWeight||1,2,disciplineRegistry);
            const fallbackSpecific=cargo.synthetic?'Conhecimentos do Edital':`Conhecimentos Específicos — ${titleCaseLoose(cargo.rawLabel||cargo.label)}`;
            // Em editais multicargo, o quadro da prova costuma listar apenas o bucket
            // "Conhecimentos Específicos", e não os títulos internos de cada cargo.
            // Portanto, o registro canônico bloqueia o conteúdo comum, mas o bloco específico
            // do cargo continua sendo verticalizado por sua própria estrutura. Em edital de
            // bloco único (ex.: Vunesp), o registro continua valendo para todo o programa.
            const specificRegistry=cargo.synthetic ? disciplineRegistry : [];
            let specificMaterias=parseDisciplineSections(specificLines,fallbackSpecific,weights.specificWeight||1,(weights.specificWeight>weights.generalWeight)?1:2,specificRegistry);
            // Se o quadro da prova foi encontrado mas não casou com este recorte (edital excepcional),
            // recua com segurança para a análise estrutural original em vez de retornar vazio.
            if(disciplineRegistry.length>=2 && !generalMaterias.length && !specificMaterias.length){
                generalMaterias=parseDisciplineSections(generalLines,'Conhecimentos Gerais',weights.generalWeight||1,2,[]);
                specificMaterias=parseDisciplineSections(specificLines,fallbackSpecific,weights.specificWeight||1,(weights.specificWeight>weights.generalWeight)?1:2,[]);
            }
            let materias=mergeMaterias([...generalMaterias,...specificMaterias]);

            // Remove artefatos de escopo que eventualmente tenham sido interpretados como disciplina.
            materias=materias.filter(m=>{
                const f=foldEditalText(m.materia);
                return !GENERIC_SCOPE_WORDS.has(f) && !/^prova de conhecimentos/.test(f) && !roleSignal(m.materia);
            });
            if(!materias.length) throw new Error('Nenhuma matéria com assuntos foi identificada no bloco selecionado.');

            const selectedPages=[...new Set([...generalLines,...specificLines].map(x=>x.pageNumber).filter(Boolean))].sort((a,b)=>a-b);
            const text=[`BLOCO/CARGO SELECIONADO: ${cargo.label}`,cargo.educationLevel?`NÍVEL INFERIDO: ${cargo.educationLevel}`:'',`PESO GERAL: ${weights.generalWeight||1}`,`PESO ESPECÍFICO: ${weights.specificWeight||1}`,'','===== CONTEÚDO COMUM/GERAL =====',generalLines.map(x=>x.text).join('\n'),'','===== CONTEÚDO ESPECÍFICO =====',specificLines.map(x=>x.text).join('\n')].filter(Boolean).join('\n').slice(0,98000);
            return {cargo,materias,text,totalPages:structure.totalPages,selectedPages,selectedChars:text.length,selectionMode:'adaptive-universal-parser-v9.14.1',disciplineRegistry,auditWarnings,confidence:materias.reduce((s,m)=>s+(Number(m.confidence)||.5),0)/materias.length,weights};
        }

        async function prepareAiCargoSelector(fileObj) {
            const select=document.getElementById('selectAiCargo'),hint=document.getElementById('aiCargoHint'),analyzeBtn=document.getElementById('btnExecutarAnaliseIA');
            if(!select||!fileObj?.blob)return; select.disabled=true; analyzeBtn.disabled=true; select.innerHTML='<option value="">Detectando cargos/áreas...</option>';
            try{
                const structure=await loadAiPdfStructure(fileObj.blob,fileObj.name||'');
                select.innerHTML='<option value="">Selecione o cargo/área/especialidade...</option>'+structure.cargos.map(c=>`<option value="${escapeHtml(c.code)}">${escapeHtml(cargoSelectLabel(c))}</option>`).join('');
                select.disabled=false; if(structure.cargos.length===1)select.value=structure.cargos[0].code; analyzeBtn.disabled=false;
                if(hint)hint.textContent=structure.cargos[0]?.synthetic?'Edital com cargo/bloco único: matérias e assuntos serão identificados automaticamente a partir do conteúdo programático.':`${structure.cargos.length} cargo(s)/área(s)/especialidade(s) localizado(s). O V9.13 combinará internamente conteúdo comum, nível/escolaridade e bloco específico quando existirem.`;
                setAiEditalStatus('');
            }catch(error){console.error('Falha ao detectar estrutura:',error);select.innerHTML='<option value="">Não foi possível detectar blocos</option>';if(hint)hint.textContent=error.message||'Falha na leitura.';setAiEditalStatus(error.message||'Não foi possível detectar a estrutura.',true);}
        }

        async function openModalAnaliseEditalIA() {
            currentAiEditalAnalysis=null; const preview=document.getElementById('aiEditalPreview'),importBtn=document.getElementById('btnImportarAnaliseIA'),analyzeBtn=document.getElementById('btnExecutarAnaliseIA'),select=document.getElementById('selectAiCargo');
            if(preview){preview.innerHTML='';preview.classList.remove('visible')} if(importBtn)importBtn.disabled=true; if(analyzeBtn)analyzeBtn.disabled=true; if(select){select.disabled=true;select.innerHTML='<option value="">Detectando a estrutura do edital...</option>'} setAiEditalStatus(''); const aiModal=document.getElementById('modalAnaliseEditalIA'); aiModal.querySelector('.modal')?.classList.remove('ai-result-ready'); aiModal.style.display='flex';
            const info=document.getElementById('aiEditalFileInfo');
            try{
                const fileObj=await getEditalFileRecord(); if(!fileObj){info.innerHTML='Nenhum edital está anexado ao concurso atual. Use <strong>Ver / Anexar Edital PDF</strong> antes de iniciar a análise.';return}
                const sizeMB=fileObj.blob?.size?(fileObj.blob.size/(1024*1024)).toFixed(2):'—'; info.innerHTML=`Arquivo: <strong>${escapeHtml(fileObj.name||'Edital')}</strong> · ${escapeHtml(sizeMB)} MB · concurso atual: <strong>${escapeHtml(currentConcurso)}</strong>`;
                if(!(fileObj.type||'').includes('pdf')&&!String(fileObj.name||'').toLowerCase().endsWith('.pdf')){info.innerHTML+='<br><span style="color:#fbbf24;">A análise automática aceita PDF com texto pesquisável.</span>';return}
                await prepareAiCargoSelector(fileObj);
            }catch(error){info.textContent='Não foi possível ler o edital anexado.';setAiEditalStatus(error.message||'Não foi possível ler o edital.',true)}
        }

        function closeModalAnaliseEditalIA(){ document.getElementById('modalAnaliseEditalIA').style.display='none'; }

        function normalizeAiAnalysis(data) {
            const root = data && data.analysis ? data.analysis : data;
            if (!root || typeof root !== 'object') throw new Error('A análise retornou um formato inválido.');

            const materias = Array.isArray(root.materias) ? root.materias : [];
            const cleanMaterias = materias.map((mat, idx) => {
                const materia = String(mat.materia || mat.nome || `Matéria ${idx + 1}`).trim();
                const prioridade = Math.min(4, Math.max(1, parseInt(mat.prioridade) || 2));
                const pesoNum = Number(mat.peso);
                const peso = Number.isFinite(pesoNum) && pesoNum >= 0 ? pesoNum : 1.0;
                const assuntos = (Array.isArray(mat.assuntos) ? mat.assuntos : [])
                    .map(ass => String(typeof ass === 'string' ? ass : (ass?.assunto || ass?.nome || '')).trim())
                    .filter(Boolean);
                return { materia, prioridade, peso, assuntos };
            }).filter(m => m.materia && m.assuntos.length);

            if (!cleanMaterias.length) throw new Error('Não foram identificadas matérias e assuntos válidos para o cargo selecionado.');
            return { concurso: String(root.concurso || currentConcurso || '').trim(), materias: cleanMaterias };
        }

        function renderAiEditalPreview(analysis, extractionMeta) {
            const preview = document.getElementById('aiEditalPreview');
            const totalTopics = analysis.materias.reduce((sum, m) => sum + m.assuntos.length, 0);
            const pagesLabel = extractionMeta?.selectedPages?.length
                ? `${extractionMeta.selectedPages.length}/${extractionMeta.totalPages}`
                : '—';

            let html = `
                <div class="ai-source-note" style="margin-bottom:0.8rem; padding:0.65rem 0.75rem; border:1px solid rgba(139,92,246,.35); border-radius:9px;">
                    <strong>Cargo analisado:</strong> ${escapeHtml(cargoSelectLabel(extractionMeta?.cargo) || '—')}<br>
                    <strong>Modo:</strong> Universal Parser V9.20 · confiança estrutural: <strong>${Math.round((extractionMeta?.confidence || 0) * 100)}%</strong>. A IA não altera a relação matéria → assuntos.
                </div>
                <div class="ai-preview-header">
                    <div class="ai-preview-stat"><strong>${analysis.materias.length}</strong><span>matérias</span></div>
                    <div class="ai-preview-stat"><strong>${totalTopics}</strong><span>assuntos</span></div>
                    <div class="ai-preview-stat"><strong>${escapeHtml(pagesLabel)}</strong><span>páginas utilizadas</span></div>
                </div>`;

            analysis.materias.forEach(mat => {
                html += `<div class="ai-preview-materia">
                    <div class="ai-preview-materia-title">
                        <span>${escapeHtml(mat.materia)} <small style="opacity:.65;">(${mat.assuntos.length} assuntos · peso ${escapeHtml(String(mat.peso))}${mat.confidence ? ` · confiança ${Math.round(mat.confidence*100)}%` : ''})</small></span>
                        <span class="ai-priority-badge ai-priority-${mat.prioridade}" title="Prioridade da matéria">P${mat.prioridade}</span>
                    </div>
                    <div class="ai-preview-topics">`;

                mat.assuntos.forEach((ass, idx) => {
                    html += `<div class="ai-preview-topic"><span>${idx + 1}. ${escapeHtml(ass)}</span></div>`;
                });
                html += `</div></div>`;
            });

            preview.innerHTML = html;
            preview.classList.add('visible');
            const aiModalBox = document.querySelector('#modalAnaliseEditalIA .modal');
            aiModalBox?.classList.add('ai-result-ready');
            if (window.matchMedia('(max-width: 900px), (max-height: 720px)').matches) {
                requestAnimationFrame(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }
        }

        async function executarAnaliseEditalIA() {
            const analyzeBtn = document.getElementById('btnExecutarAnaliseIA');
            const importBtn = document.getElementById('btnImportarAnaliseIA');
            analyzeBtn.disabled = true;
            importBtn.disabled = true;
            currentAiEditalAnalysis = null;

            try {
                if (!navigator.onLine) throw new Error('A análise por IA exige conexão com a internet.');
                const fileObj = await getEditalFileRecord();
                if (!fileObj) throw new Error('Anexe primeiro um edital PDF ao concurso atual.');

                const cargoCode = document.getElementById('selectAiCargo')?.value || '';
                if (!cargoCode) throw new Error('Selecione o bloco/cargo/área antes de analisar.');

                setAiEditalStatus('Aplicando parsers estruturais adaptativos e separando matérias/assuntos...');
                const structure = await loadAiPdfStructure(fileObj.blob, fileObj.name || '');
                const extraction = buildSelectedCargoExtraction(structure, cargoCode);

                setAiEditalStatus(`Estrutura detectada: ${extraction.materias.length} matérias e ${extraction.materias.reduce((s,m)=>s+m.assuntos.length,0)} assuntos. Consultando Workers AI apenas para priorização...`);

                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para utilizar a IA.');

                const response = await fetch('/api/ai/analisar-edital', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        concurso: currentConcurso,
                        banca: document.getElementById('inputAiBanca')?.value?.trim() || '',
                        fileName: fileObj.name || 'Edital.pdf',
                        cargo: extraction.cargo,
                        text: extraction.text,
                        lockedMaterias: extraction.materias,
                        selectedPages: extraction.selectedPages,
                        totalPages: extraction.totalPages
                    })
                });

                const payload = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(payload.error || `Erro ${response.status} ao consultar a IA.`);

                const analysis = normalizeAiAnalysis(payload);
                // Reanexa metadados de proveniência/confiança do parser determinístico.
                const sourceMeta = new Map(extraction.materias.map(m => [foldEditalText(m.materia), m]));
                analysis.materias = analysis.materias.map(m => ({ ...m, ...(sourceMeta.get(foldEditalText(m.materia)) ? {
                    confidence: sourceMeta.get(foldEditalText(m.materia)).confidence,
                    sourcePages: sourceMeta.get(foldEditalText(m.materia)).sourcePages,
                    detectionMethod: sourceMeta.get(foldEditalText(m.materia)).detectionMethod
                } : {}) }));
                currentAiEditalAnalysis = { analysis, extraction, model: payload.model || '' };
                renderAiEditalPreview(analysis, extraction);

                const modelInfo = payload.aiUsed === false ? 'extração determinística (IA indisponível para prioridade)' : (payload.model || 'Workers AI');
                const auditNote=(extraction.auditWarnings||[]).length ? ` Verificação estrutural: ${extraction.auditWarnings.length} alerta(s). Revise o preview antes de importar.` : '';
                setAiEditalStatus(`Análise concluída para ${cargoSelectLabel(extraction.cargo)}. Matérias e assuntos foram bloqueados pelo Universal Parser V9.20; modelo: ${modelInfo}.${auditNote}`);
                importBtn.disabled = false;
            } catch (error) {
                console.error('Erro na análise de edital com IA:', error);
                setAiEditalStatus(error.message || 'Não foi possível analisar o edital.', true);
            } finally {
                analyzeBtn.disabled = false;
            }
        }

        async function importarAnaliseEditalIA() {
            if (!currentAiEditalAnalysis?.analysis) return alert('Execute a análise antes de importar.');
            const analysis = currentAiEditalAnalysis.analysis;
            const existingKeys = new Set(
                allEditalItems
                    .filter(i => (i.concurso || 'Concurso Geral') === currentConcurso)
                    .map(i => `${String(i.materia || '').trim().toLowerCase()}|||${String(i.assunto || '').trim().toLowerCase()}`)
            );
            const novos = [];

            analysis.materias.forEach(mat => {
                mat.assuntos.forEach((ass, idxAss) => {
                    const assunto = String(ass || '').trim();
                    const key = `${mat.materia.trim().toLowerCase()}|||${assunto.toLowerCase()}`;
                    if (!assunto || existingKeys.has(key)) return;
                    existingKeys.add(key);
                    novos.push({
                        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
                        materia: mat.materia,
                        assunto: assunto,
                        prioridade: mat.prioridade,
                        assunto_prioridade: mat.prioridade,
                        peso: Number(mat.peso) || 1,
                        concurso: currentConcurso,
                        user_id: currentUser ? currentUser.id : null,
                        teoria: false,
                        questoes: false,
                        rev_24h: false,
                        rev_7d: false,
                        rev_30d: false
                    });
                    openMaterias[mat.materia] = false;
                });
            });

            if (!novos.length) return alert('Todos os tópicos identificados pela IA já existem neste concurso. Nenhum item foi duplicado.');
            const ok = confirm(`Importar ${novos.length} novos tópicos para "${currentConcurso}"?\n\nTópicos já existentes serão preservados e não serão duplicados.`);
            if (!ok) return;

            const metadata = getConcursosMetadata();
            if (!metadata[currentConcurso]) metadata[currentConcurso] = {};
            if (!metadata[currentConcurso].materiaWeights) metadata[currentConcurso].materiaWeights = {};
            analysis.materias.forEach(mat => {
                const weight = Number(mat.peso);
                if (Number.isFinite(weight) && weight > 0) metadata[currentConcurso].materiaWeights[mat.materia] = weight;
            });
            await saveConcursosMetadata(metadata);

            novos.forEach(item => {
                allEditalItems.push(item);
                queueEditalUpsert(item);
            });
            saveEditalToLocalStorage();

            if (navigator.onLine && currentUser) {
                try { await flushPendingEdital(); }
                catch (error) { console.warn('Itens da IA mantidos na fila de sincronização:', error); }
            }
            filterDataByConcurso();
            closeModalAnaliseEditalIA();
            alert(`${novos.length} tópicos importados com sucesso. As matérias permanecem recolhidas por padrão.`);
        }

        function openModalViewEdital() {
            document.getElementById('editalModalTitle').innerText = `Documento do Edital (${currentConcurso})`;
            renderEditalFileViewer();
            document.getElementById('modalViewEdital').style.display = 'flex';
            // Biblioteca pesada carregada somente quando o recurso de edital é realmente aberto.
            scheduleBackgroundTask(() => loadPdfJsOnce().catch(error => console.warn(error.message)), 1000);
        }

        function closeModalViewEdital() {
            if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }
            document.getElementById('modalViewEdital').style.display = 'none';
        }

        function getEditalFileStorageKey(concursoName = currentConcurso) {
            const uid = currentUser ? currentUser.id : 'guest';
            return `edital_file_${uid}_${concursoName}`;
        }

        function openEditalFilesDatabase() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('painel-estudos-files', 1);
                request.onupgradeneeded = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('editalFiles')) db.createObjectStore('editalFiles', { keyPath: 'key' });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error || new Error('Não foi possível abrir o armazenamento de arquivos.'));
            });
        }

        async function putEditalFileRecord(record) {
            const db = await openEditalFilesDatabase();
            return new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readwrite').objectStore('editalFiles').put(record);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Não foi possível salvar o arquivo.'));
            });
        }

        async function getEditalFileRecord(key = getEditalFileStorageKey()) {
            const db = await openEditalFilesDatabase();
            const storedRecord = await new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readonly').objectStore('editalFiles').get(key);
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error('Não foi possível ler o arquivo.'));
            });
            if (storedRecord) return storedRecord;

            const legacyData = localStorage.getItem(key);
            if (!legacyData) return null;
            try {
                const legacyFile = JSON.parse(legacyData);
                const migratedRecord = {
                    key,
                    name: legacyFile.name || 'Edital.pdf',
                    type: legacyFile.type || 'application/pdf',
                    blob: dataURLtoBlob(legacyFile.data),
                    updatedAt: new Date().toISOString()
                };
                await putEditalFileRecord(migratedRecord);
                localStorage.removeItem(key);
                return migratedRecord;
            } catch (error) {
                console.warn('Não foi possível migrar o anexo antigo:', error);
                return null;
            }
        }

        async function deleteEditalFileRecord(key = getEditalFileStorageKey()) {
            const db = await openEditalFilesDatabase();
            await new Promise((resolve, reject) => {
                const request = db.transaction('editalFiles', 'readwrite').objectStore('editalFiles').delete(key);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error || new Error('Não foi possível apagar o arquivo.'));
            });
            localStorage.removeItem(key);
        }

        async function moveEditalFileRecord(oldKey, newKey) {
            const record = await getEditalFileRecord(oldKey);
            if (!record) return;
            await putEditalFileRecord({ ...record, key: newKey });
            await deleteEditalFileRecord(oldKey);
        }

        function dataURLtoBlob(dataurl) {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) { u8arr[n] = bstr.charCodeAt(n); }
            return new Blob([u8arr], { type: mime });
        }

        async function renderEditalFileViewer() {
            const container = document.getElementById('editalViewerContainer');
            const btnDownload = document.getElementById('btnDownloadEdital');
            const btnRemove = document.getElementById('btnRemoveEdital');

            if (activeObjectUrl) { URL.revokeObjectURL(activeObjectUrl); activeObjectUrl = null; }

            try {
                const fileObj = await getEditalFileRecord();
                if (!fileObj) {
                    container.innerHTML = `<p style="opacity: 0.85; margin-bottom: 12px;">Nenhum documento anexado para o concurso <strong>${escapeHtml(currentConcurso)}</strong>.</p>`;
                    btnDownload.style.display = 'none';
                    btnRemove.style.display = 'none';
                    return;
                }
                btnDownload.style.display = 'inline-flex';
                btnRemove.style.display = 'inline-flex';
                activeObjectUrl = URL.createObjectURL(fileObj.blob);
                if (fileObj.type.includes('pdf')) {
                    container.innerHTML = `<embed src="${activeObjectUrl}#toolbar=1" type="application/pdf" style="width:100%; height:100%; min-height:500px; border:none; border-radius:6px;"></embed>`;
                } else if (fileObj.type.includes('image')) {
                    container.innerHTML = `<img src="${activeObjectUrl}" alt="Pré-visualização do edital" style="max-width:100%; max-height:480px; border-radius:6px; object-fit:contain;">`;
                } else {
                    container.innerHTML = `<p style="font-size:1.1rem; font-weight:700; color:var(--primary-blue);">${escapeHtml(fileObj.name)}</p>`;
                }
            } catch (e) {
                container.innerHTML = `<p style="color:#ef4444;">Erro ao carregar arquivo do edital.</p>`;
            }
        }

        async function uploadEditalFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            try {
                await putEditalFileRecord({
                    key: getEditalFileStorageKey(),
                    name: file.name,
                    type: file.type || 'application/octet-stream',
                    blob: file,
                    updatedAt: new Date().toISOString()
                });
                await renderEditalFileViewer();
                alert('Arquivo anexado com sucesso!');
            } catch (error) {
                alert('Não foi possível armazenar o arquivo neste navegador. Verifique o espaço disponível.');
            }
            event.target.value = '';
        }

        async function downloadEditalFile() {
            const fileObj = await getEditalFileRecord();
            if (!fileObj) return;
            const downloadUrl = URL.createObjectURL(fileObj.blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileObj.name || 'Edital.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
        }

        async function removerEditalFile() {
            if (confirm(`Remover o edital do concurso "${currentConcurso}"?`)) {
                await deleteEditalFileRecord();
                await renderEditalFileViewer();
            }
        }

        function openModalPromptIA() { document.getElementById('modalPromptIA').style.display = 'flex'; }
        function closeModalPromptIA() { document.getElementById('modalPromptIA').style.display = 'none'; }
        function copyPromptToClipboard() {
            navigator.clipboard.writeText(document.getElementById('promptTextToCopy').innerText);
            alert('Prompt copiado!');
        }

        async function checkAuthAndSync() {
            try {
                const { data, error } = await supabaseClient.auth.getSession();
                if (error) throw error;
                const session = data?.session || null;
                if (session?.user) {
                    currentUser = session.user;
                    prepareAuthenticatedUserContext(currentUser);
                    checkSuperUserStatus();
                    showDashboard();
                } else {
                    showCleanAuthScreen();
                }
            } catch (error) {
                console.warn('Falha ao recuperar sessão inicial:', error);
                showCleanAuthScreen('Não foi possível restaurar a sessão. Entre novamente.');
            }
        }

        async function handleLogin() {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            if (!email || !password) return alert('Preencha e-mail e senha.');
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) alert('Erro ao entrar: ' + error.message);
            else { currentUser = data.user; prepareAuthenticatedUserContext(currentUser); checkSuperUserStatus(); showDashboard(); }
        }

        async function handleSignUp() {
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            if (!email || !password) return alert('Preencha e-mail e senha.');
            const { data, error } = await supabaseClient.auth.signUp({ email, password });
            if (error) return alert('Erro ao cadastrar: ' + error.message);

            // Se a confirmação de e-mail estiver desativada no Supabase, o cadastro
            // já retorna uma sessão válida. Nesse caso, inicia imediatamente um
            // contexto limpo para o novo user_id. Com confirmação ativa, session é null.
            if (data?.session?.user) {
                currentUser = data.session.user;
                prepareAuthenticatedUserContext(currentUser);
                checkSuperUserStatus();
                showDashboard();
                return appNotice('Conta criada e conectada com sucesso.', { title:'Bem-vindo' });
            }

            return appNotice('Cadastro realizado. Verifique seu e-mail para confirmar a conta e depois entre no Painel.', { title:'Confirme seu e-mail' });
        }

        function openAccountModal() {
            if (!currentUser) return appNotice('Você precisa estar conectado para acessar a conta.', { title:'Conta indisponível' });
            const email = document.getElementById('accountUserEmail');
            if (email) email.textContent = currentUser.email || 'E-mail não disponível';
            ['accountCurrentPassword','accountNewPassword','accountConfirmPassword','accountDeletePassword','accountDeleteConfirmation','accountPermanentDeletePassword','accountPermanentDeleteConfirmation'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const modal = document.getElementById('modalAccount');
            if (modal) modal.style.display = 'flex';
        }

        function closeAccountModal() {
            const modal = document.getElementById('modalAccount');
            if (modal) modal.style.display = 'none';
            ['accountCurrentPassword','accountNewPassword','accountConfirmPassword','accountDeletePassword','accountDeleteConfirmation','accountPermanentDeletePassword','accountPermanentDeleteConfirmation'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
        }

        function openBackupFromAccount() {
            closeAccountModal();
            openBackupManager();
        }

        async function verifyCurrentAccountPassword(password) {
            if (!currentUser?.email) throw new Error('A sessão atual não possui um e-mail disponível.');
            const result = await supabaseClient.auth.signInWithPassword({ email:currentUser.email, password });
            if (result.error) throw new Error('Senha atual inválida.');
            if (!result.data?.user || result.data.user.id !== currentUser.id) throw new Error('Não foi possível confirmar a identidade desta conta.');
            currentUser = result.data.user;
            prepareAuthenticatedUserContext(currentUser);
            return true;
        }

        async function changeAccountPassword() {
            if (!currentUser) return;
            const currentPassword = document.getElementById('accountCurrentPassword')?.value || '';
            const newPassword = document.getElementById('accountNewPassword')?.value || '';
            const confirmPassword = document.getElementById('accountConfirmPassword')?.value || '';
            if (!currentPassword || !newPassword || !confirmPassword) {
                return appNotice('Preencha a senha atual, a nova senha e a confirmação.', { title:'Alterar senha' });
            }
            if (newPassword.length < 8) return appNotice('A nova senha deve ter pelo menos 8 caracteres.', { title:'Senha muito curta' });
            if (newPassword !== confirmPassword) return appNotice('A confirmação da nova senha não corresponde.', { title:'Senhas diferentes' });
            if (newPassword === currentPassword) return appNotice('Escolha uma nova senha diferente da senha atual.', { title:'Senha sem alteração' });

            const ok = await appConfirm('Alterar a senha desta conta agora?', { title:'Confirmar alteração de senha', confirmText:'Alterar senha' });
            if (!ok) return;
            try {
                await verifyCurrentAccountPassword(currentPassword);
                const { data, error } = await supabaseClient.auth.updateUser({ password:newPassword });
                if (error) throw error;
                if (data?.user) currentUser = data.user;
                ['accountCurrentPassword','accountNewPassword','accountConfirmPassword'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.value = '';
                });
                await appNotice('Senha alterada com sucesso.', { title:'Segurança da conta' });
            } catch (error) {
                await appNotice(`Não foi possível alterar a senha: ${error.message}`, { title:'Falha ao alterar senha' });
            }
        }

        async function deleteIndexedDbRecordsForUser(uid) {
            // PDFs/anexos do edital.
            try {
                const db = await openEditalFilesDatabase();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction('editalFiles', 'readwrite');
                    const store = tx.objectStore('editalFiles');
                    const req = store.openCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (!cursor) return;
                        const key = String(cursor.key || cursor.value?.key || '');
                        if (key.startsWith(`edital_file_${uid}_`) || String(cursor.value?.userId || '') === uid) cursor.delete();
                        cursor.continue();
                    };
                    req.onerror = () => reject(req.error || new Error('Falha ao limpar PDFs locais.'));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar PDFs locais.'));
                    tx.onabort = () => reject(tx.error || new Error('Limpeza de PDFs cancelada.'));
                });
                db.close();
            } catch (error) {
                console.warn('Limpeza do IndexedDB de arquivos:', error);
                throw error;
            }

            // Backups Atual/Anterior deste usuário.
            try {
                const db = await openLocalBackupDatabase();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(LOCAL_BACKUP_STORE, 'readwrite');
                    const store = tx.objectStore(LOCAL_BACKUP_STORE);
                    const req = store.openCursor();
                    req.onsuccess = () => {
                        const cursor = req.result;
                        if (!cursor) return;
                        const key = String(cursor.key || cursor.value?.key || '');
                        if (key.startsWith(`${uid}:`) || String(cursor.value?.userId || '') === uid) cursor.delete();
                        cursor.continue();
                    };
                    req.onerror = () => reject(req.error || new Error('Falha ao limpar backups locais.'));
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error || new Error('Falha ao limpar backups locais.'));
                    tx.onabort = () => reject(tx.error || new Error('Limpeza de backups cancelada.'));
                });
                db.close();
            } catch (error) {
                console.warn('Limpeza do IndexedDB de backups:', error);
                throw error;
            }
        }

        async function clearLocalStudyDataForUser(uid, options = {}) {
            clearTimeout(localBackupTimer);
            backupRestoreInProgress = true;
            const exactKeys = new Set([
                `concursos_metadata_${uid}`,
                `edital_offline_data_${uid}`,
                `pending_sync_${uid}`,
                `last_studied_concurso_${uid}`,
                `last_successful_sync_${uid}`,
                `flashcard_shuffle_history_${uid}`
            ]);
            const prefixes = [
                `pomodoro_daily_minutes_${uid}_`,
                `pomodoro_extra_minutes_${uid}_`,
                `edital_file_${uid}_`
            ];
            const remove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (exactKeys.has(key) || prefixes.some(prefix => key.startsWith(prefix)))) remove.push(key);
            }
            remove.forEach(key => localStorage.removeItem(key));
            if (options.includeLegacy) {
                [
                    'last_studied_concurso',
                    'concursos_metadata_guest',
                    'edital_offline_data_guest',
                    'pending_sync_guest',
                    'last_successful_sync_guest'
                ].forEach(key => localStorage.removeItem(key));
            }
            await deleteIndexedDbRecordsForUser(uid);
        }

        async function deleteAllAccountStudyData() {
            if (!currentUser) return;
            if (!navigator.onLine) {
                return appNotice('Esta operação exige conexão com a internet para apagar primeiro os dados no Supabase. Nenhum dado foi removido.', { title:'Conexão necessária' });
            }
            const password = document.getElementById('accountDeletePassword')?.value || '';
            const confirmation = (document.getElementById('accountDeleteConfirmation')?.value || '').trim();
            if (!password) return appNotice('Informe sua senha atual para confirmar a exclusão.', { title:'Confirmação necessária' });
            if (confirmation !== 'EXCLUIR') return appNotice('Digite exatamente EXCLUIR para liberar a operação.', { title:'Confirmação necessária' });

            const ok = await appConfirm(
                'Esta operação apagará permanentemente todos os seus dados de estudo no Supabase e neste dispositivo, inclusive PDFs e backups locais. O login será preservado.\n\nEsta ação não pode ser desfeita. Continuar?',
                { title:'Excluir todos os dados', confirmText:'Excluir permanentemente', danger:true }
            );
            if (!ok) return;

            const uid = currentUser.id;
            try {
                await verifyCurrentAccountPassword(password);
                const { data, error } = await supabaseClient.rpc('delete_my_study_data');
                if (error) {
                    if (/function .*delete_my_study_data|Could not find the function|PGRST202/i.test(error.message || '')) {
                        throw new Error('A função segura delete_my_study_data ainda não está instalada no Supabase. Execute o SQL fornecido com a V9.51 e tente novamente.');
                    }
                    throw error;
                }
                await clearLocalStudyDataForUser(uid);
                resetInMemoryUserState();
                currentConcurso = 'Concurso Geral';
                metadataCache = {};
                console.info('Exclusão de dados concluída:', data || {});
                closeAccountModal();
                await appNotice('Todos os dados de estudo foram excluídos. Sua conta e seu e-mail foram preservados. O Painel será reiniciado em estado limpo.', { title:'Dados excluídos' });
                location.reload();
            } catch (error) {
                backupRestoreInProgress = false;
                await appNotice(`A exclusão não foi concluída: ${error.message}`, { title:'Falha na exclusão' });
            }
        }

        function clearSupabaseAuthStorage() {
            try {
                const projectRef = (() => {
                    try { return new URL(SUPABASE_URL).hostname.split('.')[0]; } catch (_) { return ''; }
                })();
                const remove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key) continue;
                    if ((projectRef && key === `sb-${projectRef}-auth-token`) || key === 'supabase.auth.token') remove.push(key);
                }
                remove.forEach(key => localStorage.removeItem(key));
            } catch (error) {
                console.warn('Limpeza local da sessão Supabase:', error);
            }
        }

        function showCleanAuthScreen(message = '') {
            currentUser = null;
            isSuperUser = false;
            activeUserContextId = null;
            userContextGeneration += 1;
            dashboardLoadPromise = null;
            syncPromise = null;
            syncUiMode = 'idle';
            resetInMemoryUserState();
            currentConcurso = 'Concurso Geral';
            metadataCache = {};
            backupRestoreInProgress = false;
            document.getElementById('app-dashboard').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            if (email) email.value = '';
            if (password) password.value = '';
            const status = document.getElementById('authStatusMessage');
            if (status) {
                status.textContent = message || '';
                status.style.display = message ? 'block' : 'none';
            }
        }

        async function deleteAccountPermanently() {
            if (!currentUser) return;
            if (!navigator.onLine) {
                return appNotice('A exclusão permanente da conta exige conexão com a internet. Nenhum dado foi removido.', { title:'Conexão necessária' });
            }

            const password = document.getElementById('accountPermanentDeletePassword')?.value || '';
            const confirmation = (document.getElementById('accountPermanentDeleteConfirmation')?.value || '').trim();
            if (!password) return appNotice('Informe sua senha atual para excluir a conta.', { title:'Confirmação necessária' });
            if (confirmation !== 'EXCLUIR CONTA') {
                return appNotice('Digite exatamente EXCLUIR CONTA para liberar a exclusão permanente.', { title:'Confirmação necessária' });
            }

            const ok = await appConfirm(
                'Esta operação excluirá permanentemente seus dados de estudo E o seu usuário de login. Você será desconectado imediatamente e voltará para a tela inicial. Para usar este e-mail novamente no futuro, será necessário fazer um novo cadastro.\n\nEsta ação não pode ser desfeita. Continuar?',
                { title:'Excluir conta permanentemente', confirmText:'Excluir minha conta', danger:true }
            );
            if (!ok) return;

            const uid = currentUser.id;
            try {
                await verifyCurrentAccountPassword(password);
                const { data:sessionData, error:sessionError } = await supabaseClient.auth.getSession();
                if (sessionError || !sessionData?.session?.access_token) throw new Error('Não foi possível obter uma sessão válida para excluir a conta.');

                // V9.54: exclusão permanente migrou para Supabase Edge Function.
                // A função recebe automaticamente o JWT da sessão pelo supabase-js,
                // identifica o próprio usuário e nunca aceita user_id arbitrário do navegador.
                const { data:payload, error:functionError } = await supabaseClient.functions.invoke('delete-account', {
                    body: { confirm: true }
                });
                if (functionError) {
                    const contextMessage = functionError?.context?.error || functionError?.context?.message || '';
                    const message = payload?.error || contextMessage || functionError.message || 'Falha ao executar a função segura de exclusão.';
                    if (/not found|404|function.*delete-account/i.test(message)) {
                        throw new Error('A Edge Function delete-account ainda não foi publicada no Supabase. Publique a função fornecida com a V9.54 e tente novamente.');
                    }
                    throw new Error(message);
                }
                if (!payload?.deleted) {
                    throw new Error(payload?.error || 'O Supabase não confirmou a exclusão permanente da conta.');
                }

                // A conta já foi removida no servidor. Daqui em diante, toda limpeza
                // local é best-effort e nunca deve manter o usuário dentro do app.
                closeAccountModal();
                document.getElementById('app-dashboard').style.display = 'none';
                try { await clearLocalStudyDataForUser(uid, { includeLegacy:true }); }
                catch (localError) { console.warn('Conta excluída; limpeza local parcial:', localError); }

                try { await supabaseClient.auth.signOut({ scope:'local' }); }
                catch (signOutError) { console.warn('Conta já excluída; signOut local:', signOutError); }
                clearSupabaseAuthStorage();
                showCleanAuthScreen('Conta excluída permanentemente. Para usar novamente este e-mail, faça um novo cadastro.');

                // Recarrega em estado anônimo para remover qualquer DOM/closure residual.
                setTimeout(() => location.replace(location.pathname + location.search), 120);
            } catch (error) {
                backupRestoreInProgress = false;
                await appNotice(`A conta não foi excluída: ${error.message}`, { title:'Falha na exclusão da conta' });
            }
        }

        async function handleLogout() {
            try {
                // Logout local: sai somente desta sessão/dispositivo, sem derrubar
                // outras sessões legítimas do mesmo usuário em outro aparelho.
                const { error } = await supabaseClient.auth.signOut({ scope:'local' });
                if (error) throw error;
            } catch (error) {
                console.warn('Falha no signOut remoto/local; limpando a interface por segurança:', error);
            }
            showCleanAuthScreen();
            clearSupabaseAuthStorage();
        }

        function checkSuperUserStatus() {
            const appRole = currentUser?.app_metadata?.role || currentUser?.user_metadata?.role || '';
            isSuperUser = appRole === 'super_user' || appRole === 'admin';
            const badge = document.getElementById('superUserBadge');
            if (badge) badge.style.display = isSuperUser ? 'inline-block' : 'none';
        }

        function showDashboard() {
            document.getElementById('auth-screen').style.display = 'none';
            document.getElementById('app-dashboard').style.display = 'block';
            updateOnlineStatusBannerOnly();
            updateSyncIndicator();
            if (dashboardLoadPromise) return;
            dashboardLoadPromise = loadData().catch(error => {
                console.error('Falha ao carregar o painel:', error);
                alert('O painel foi aberto com os dados locais. A sincronização será tentada novamente.');
            }).finally(() => { dashboardLoadPromise = null; });
        }

        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                currentUser = session.user;
                prepareAuthenticatedUserContext(currentUser);
                checkSuperUserStatus();
                showDashboard();
                return;
            }

            // SIGNED_OUT também pode ocorrer por expiração, revogação ou exclusão
            // da conta em outro contexto. Nunca deixe o dashboard visível sem sessão.
            if (event === 'SIGNED_OUT' || !session) {
                showCleanAuthScreen();
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            checkAuthAndSync();
            const calendarGrid = document.getElementById('monthCalendarGrid');
            if (calendarGrid) {
                calendarGrid.addEventListener('keydown', event => {
                    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('month-day-cell')) {
                        event.preventDefault();
                        event.target.click();
                    }
                });
            }
        });

        function toggleDarkMode() { document.body.classList.toggle('light-mode'); }

        function updateDesktopStickyTabsOffset() {
            if (window.matchMedia('(max-width: 900px)').matches) return;
            const header = document.querySelector('header.modern-header');
            if (!header) return;
            const style = getComputedStyle(header);
            const headerTop = parseFloat(style.top) || 0;
            const stickyTop = Math.ceil(headerTop + header.offsetHeight + 10);
            document.documentElement.style.setProperty('--desktop-tabs-sticky-top', `${stickyTop}px`);
        }

        const TAB_WORKSPACE_TARGETS = Object.freeze({
            'tab-calendario': 'calendarWorkspace',
            'tab-flashcards': 'flashcardsWorkspace',
            'tab-anotacoes': 'notesWorkspace'
        });

        function getTabWorkspaceTopOffset() {
            if (window.matchMedia('(max-width: 900px)').matches) {
                return Math.max(10, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--workspace-mobile-top-gap')) || 12);
            }
            const header = document.querySelector('header.modern-header');
            if (!header) return 18;
            const style = getComputedStyle(header);
            const headerTop = parseFloat(style.top) || 0;
            return Math.ceil(headerTop + header.offsetHeight + 14);
        }

        function focusTabWorkspace(tabId, options = {}) {
            const targetId = TAB_WORKSPACE_TARGETS[tabId];
            if (!targetId) return;
            const target = document.getElementById(targetId);
            if (!target || !target.offsetParent) return;

            const offset = getTabWorkspaceTopOffset();
            const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset);
            const behavior = options.instant ? 'auto' : (options.behavior || 'smooth');
            window.scrollTo({ top, behavior });
        }

        function scheduleTabWorkspaceFocus(tabId, options = {}) {
            if (!TAB_WORKSPACE_TARGETS[tabId]) return;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => focusTabWorkspace(tabId, options));
            });
        }

        function switchTab(tabId, btn, options = {}) {
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(tb => tb.classList.remove('active'));
            const tab = document.getElementById(tabId);
            if (!tab) return;
            tab.classList.add('active');
            if (btn) btn.classList.add('active');
            document.querySelectorAll('.mobile-nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
            updateContextFab(tabId);
            updateModernOverview();

            // Renderiza componentes pesados somente quando a aba fica visível.
            if (tabId === 'tab-calendario') {
                requestAnimationFrame(() => {
                    renderMonthCalendar();
                    if (options.focus !== false) scheduleTabWorkspaceFocus(tabId, options);
                });
            } else {
                if (tabId === 'tab-edital') requestAnimationFrame(() => renderChart());
                if (options.focus !== false) scheduleTabWorkspaceFocus(tabId, options);
            }
        }



