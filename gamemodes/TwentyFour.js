module.exports = {
    // Generate a new question
    generateQuestion: (difficulty) => {
        // Difficulty controls the number of possible solutions
        // Easy: Many solutions (obvious)
        // Normal: Some solutions
        // Hard: Few solutions (tricky)

        // We use standard 1-13 deck for all difficulties to allow for variety,
        // but verify solvability count.

        // REFINEMENT: 
        // Easy: 1-9 numbers. At least 10 solutions.
        // Normal: 1-13 numbers. At least 10 solutions (Was previously "Easy", but perceived as Harder).
        // Hard: 1-13 numbers. Less than 10 solutions.

        // Helper to score solution complexity (lower is simpler)
        function getComplexity(expr) {
            let score = 0;
            // Division adds complexity
            score += (expr.split('/').length - 1) * 3;
            // Multiplication adds a little
            score += (expr.split('*').length - 1) * 1;
            // Parenthesis nesting/count adds complexity
            score += (expr.split('(').length - 1) * 0.5;

            return score;
        }

        // We use standard 1-13 deck for all difficulties
        // Easy: 1-9. Normal/Hard: 1-13.
        const maxNum = (difficulty === 'easy') ? 9 : 13;

        // Structure: { val: number, expr: string, op: number } (op is order mapping for sort if needed)
        // Simpler: just pass { val: number, expr: string }

        function solve(items) {
            if (items.length === 1) {
                if (Math.abs(items[0].val - 24) < 0.000001) {
                    return [items[0].expr];
                } else {
                    return [];
                }
            }

            let solutions = [];

            for (let i = 0; i < items.length; i++) {
                for (let j = 0; j < items.length; j++) {
                    if (i === j) continue;

                    const list2 = [];
                    for (let k = 0; k < items.length; k++) {
                        if (k !== i && k !== j) list2.push(items[k]);
                    }

                    const a = items[i];
                    const b = items[j];

                    // a + b
                    solutions = solutions.concat(solve([...list2, { val: a.val + b.val, expr: `(${a.expr} + ${b.expr})` }]));

                    // a * b
                    solutions = solutions.concat(solve([...list2, { val: a.val * b.val, expr: `(${a.expr} * ${b.expr})` }]));

                    // a - b
                    solutions = solutions.concat(solve([...list2, { val: a.val - b.val, expr: `(${a.expr} - ${b.expr})` }]));

                    // a / b
                    if (b.val !== 0) {
                        solutions = solutions.concat(solve([...list2, { val: a.val / b.val, expr: `(${a.expr} / ${b.expr})` }]));
                    }
                }
            }
            return solutions;
        }

        let numbers = [];
        let attempts = 0;
        let validSolutions = [];

        do {
            numbers = [];
            // Generate numbers
            for (let i = 0; i < 4; i++) {
                numbers.push(Math.floor(Math.random() * maxNum) + 1);
            }

            // Prepare for solver
            const items = numbers.map(n => ({ val: n, expr: n.toString() }));
            const solutions = solve(items);

            // Filter unique expression structures roughly (simplistic check)
            validSolutions = [...new Set(solutions)];

            if (validSolutions.length > 0) {
                // Determine simplest solution
                const scores = validSolutions.map(s => getComplexity(s));
                const minScore = Math.min(...scores);
                const maxScore = Math.max(...scores);

                if (difficulty === 'easy') {
                    // Must have at least one very simple solution (no division, few parens)
                    // Score heuristic: 3 adds is 0. 2 adds 1 mult (score 1).
                    // Allow score <= 2 (mostly add/sub/mult)
                    if (minScore <= 2 && validSolutions.length >= 5) break;
                } else if (difficulty === 'normal') {
                    // Moderate complexity allowed
                    if (validSolutions.length >= 5) break;
                } else { // Hard
                    // Only complex solutions or very few solutions
                    // Force division or complexity or uniqueness
                    if (minScore > 2 || validSolutions.length < 5) break;
                }
            }

            attempts++;
        } while (attempts < 2000);

        // Fallback if difficulty criteria not met
        if (validSolutions.length === 0) {
            numbers = [3, 8, 3, 8];
            validSolutions = ["8 / (3 - 8/3)"];
        }

        // Sort solutions by complexity to show the simplest one
        validSolutions.sort((a, b) => getComplexity(a) - getComplexity(b));

        console.log(`24 Game Mode (${difficulty}): Generated numbers ${numbers.join(', ')} with best complexity ${getComplexity(validSolutions[0])}`);

        // Pick one sample solution to show at the end
        let sampleSolution = validSolutions[0];
        if (sampleSolution && sampleSolution.startsWith('(') && sampleSolution.endsWith(')')) {
            sampleSolution = sampleSolution.substring(1, sampleSolution.length - 1);
        }

        return { question: numbers, answer: 24, solution: sampleSolution || "No Solution" };
    },

    // Process results for the round
    calculateResults: (room) => {
        const results = [];
        const requiredNumbers = room.question.question; // array of 4 numbers

        room.users.forEach(user => {
            let answerData = room.roundAnswers[user.id];

            // answerData can be { value: "3+8+9+4", time: 123456 }
            let userExpression = (answerData && typeof answerData === 'object') ? answerData.value : null;
            let submissionTime = (answerData && typeof answerData === 'object') ? answerData.time : Infinity;

            let isCorrect = false;
            let evalResult = 0;

            if (userExpression) {
                try {
                    // Security check: only allow numbers, operators, and parenthesis
                    if (/^[\d+\-*/()\s]+$/.test(userExpression)) {
                        // 1. Verify that the numbers used are VALID (subset of required)
                        // We extract all numbers from the expression
                        const usedNumbers = userExpression.match(/\d+/g);

                        if (usedNumbers && usedNumbers.length > 0) {
                            const usedNumsArr = usedNumbers.map(Number);
                            const requiredNumsArr = [...requiredNumbers];

                            // Check if used numbers are a subset of required
                            // We use a frequency map method or simple splicing
                            let validSubset = true;

                            for (let num of usedNumsArr) {
                                const idx = requiredNumsArr.indexOf(num);
                                if (idx !== -1) {
                                    requiredNumsArr.splice(idx, 1); // Remove matched to handle duplicates
                                } else {
                                    validSubset = false;
                                    break;
                                }
                            }

                            if (validSubset) {
                                // 2. Evaluate the expression
                                const func = new Function(`return ${userExpression}`);
                                evalResult = func();

                                if (Math.abs(evalResult - 24) < 0.0001) {
                                    isCorrect = true;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("Error evaluating expression:", userExpression, e);
                }
            }

            if (isCorrect) {
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: userExpression + " = 24", // Show the winning formula
                    time: submissionTime,
                    diff: 0 // diff 0 means correct
                });
            } else {
                results.push({
                    id: user.id,
                    name: user.name,
                    answer: null,
                    time: Infinity,
                    diff: Infinity
                });
            }
        });

        // Sort by time (fastest first)
        results.sort((a, b) => a.time - b.time);

        // Assign points
        const pointRewards = [100, 80, 60, 40, 20];
        let currentRewardIndex = 0;

        results.forEach((res, index) => {
            if (res.diff === 0) {
                const user = room.users.find(u => u.id === res.id);
                if (user) {
                    let awarded = pointRewards[currentRewardIndex] || 10;
                    user.score += awarded;
                    res.awarded = awarded;
                }
                currentRewardIndex++;
            } else {
                res.awarded = 0;
            }
        });

        return {
            winner: (results[0].diff === 0) ? results[0].name : "No one",
            correctAnswer: room.question.solution + " = 24", // Show the sample solution!
            rankings: results,
            isTie: false,
            mode: 'twenty_four'
        };
    }
};
