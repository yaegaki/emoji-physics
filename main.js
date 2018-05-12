(function () {

    // create matter engine
    function createEngine(parentNode) {
        const Engine = Matter.Engine;
        const World = Matter.World;
        const Bodies = Matter.Bodies;
        const MouseConstraint = Matter.MouseConstraint;

        let engine = Engine.create(parentNode, {
            render: {
                options: {
                    wireframes: false,
                    background: 'white'
                }
            }
        });

        // Create ground and wall
        let ground = Bodies.rectangle(400, 610, 1000, 60, { isStatic: true });
        let leftWall = Bodies.rectangle(100, 0, 30, 1500, { isStatic: true });
        let rightWall = Bodies.rectangle(700, 0, 30, 1500, { isStatic: true });
        World.add(engine.world, [ground, leftWall, rightWall]);

        // Add Box
        let boxA = Bodies.rectangle(400, 200, 80, 80);
        let boxB = Bodies.rectangle(430, 30, 50, 50);
        World.add(engine.world, [boxA, boxB]);

        let mouseConstraint = MouseConstraint.create(engine);
        World.add(engine.world, mouseConstraint);

        Engine.run(engine);
        return engine;
    }

    // split emoji string
    function stringToArray(str) {
        return str.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]/g) || [];
    }

    function createTexture(sourceCanvas, bounds) {
        let canvas = document.createElement('canvas');
        canvas.width = bounds.max.x - bounds.min.x + 1;
        canvas.height = bounds.max.y - bounds.min.y + 1;

        canvas.getContext('2d').drawImage(sourceCanvas, bounds.min.x, bounds.min.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL();
    }

    function alphaToWhite(data8U) {
        for (let i = 0; i < data8U.length; i += 4) {
            if (data8U[i + 3] == 0) {
                data8U[i] = 255;
                data8U[i + 1] = 255;
                data8U[i + 2] = 255;
                data8U[i + 3] = 255;
            }
        }
    }

    function createEmojiInfo(emoji, font) {
        let canvas = document.createElement('canvas');
        canvas.width = 50;
        canvas.height = 50;
        let context = canvas.getContext('2d');

        // draw text
        context.fillStyle = 'black';
        if (font == '') {
            // force fallback font
            context.font = '30px EMOJI_PHYSICS';
        }
        else {
            context.font = '30px "' + font + '"';
        }

        context.fillText(emoji, 10, 40);

        const emojiImage = canvas.toDataURL();
        let source = cv.imread(canvas);
        alphaToWhite(source.data);
        let destC1 = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC1);
        let destC4 = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);

        cv.cvtColor(source, destC1, cv.COLOR_RGBA2GRAY);
        cv.threshold(destC1, destC4, 254, 255, cv.THRESH_BINARY);
        cv.bitwise_not(destC4, destC4);

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(destC4, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE, { x: 0, y: 0});
        hierarchy.delete();
        destC1.delete();
        destC4.delete();
        source.delete();

        let points = [];
        for (let i = 0; i < contours.size(); i++) {
            let d = contours.get(i).data32S;
            for (let j = 0; j < d.length; j++) {
                points.push(d[j]);
            }
        }
        contours.delete();

        if (points.length < 3) {
            return null;
        }

        let _points = new cv.Mat(1, points.length / 2, cv.CV_32SC2);
        let d = _points.data32S;
        for (let i = 0; i < points.length; i++) {
            d[i] = points[i];
        }
        let hull = new cv.Mat();
        cv.convexHull(_points, hull);
        _points.delete();

        let vert = [];
        d = hull.data32S;
        for (let i = 0; i < d.length; i += 2) {
            vert.push({ x: d[i], y: d[i + 1]});
        }
        hull.delete();

        const bounds = Matter.Bounds.create(vert);
        const texture = createTexture(canvas, bounds);

        return {
            vert: vert,
            texture: texture
        };
    }

    let emojiCache = {};
    function addToWorld(engine, emoji, font, x) {
        if (!emojiCache.hasOwnProperty(font)) {
            emojiCache[font] = {};
        }

        let emojiInfoCache = emojiCache[font];
        if (!emojiInfoCache.hasOwnProperty(emoji)) {
            emojiInfoCache[emoji] = createEmojiInfo(emoji, font);
        }

        const info = emojiInfoCache[emoji];
        if (info == null) {
            console.warn('Can not add "' + emoji  + '" to world');
            return;
        }

        let emojiBody = Matter.Bodies.fromVertices(x, 0, info.vert, {
            render: {
                sprite: {
                    texture: info.texture
                }
            }
        });

        Matter.World.add(engine.world, emojiBody);
    }

    function getEmojiArray(str) {
        const array = stringToArray(str)
            .map(s => s.replace(/\s/g, ''))
            .filter(s => s.length > 0);
        
        return array;
    }

    let emojiListTextarea = document.getElementById('emoji-list');
    let engine = createEngine(document.getElementById('world'));
    const initialBodiesLength = engine.world.bodies.length;

    let input = document.getElementById('input');
    let fontInput = document.getElementById('font-input');
    document.getElementById('add-button').addEventListener('click', () => {
        let array = getEmojiArray(input.value);
        let x = 400 - (array.length - 1) / 2 * 30;
        array.forEach(s => {
            addToWorld(engine, s, fontInput.value, x);
            x += 30;
        });
    });

    document.getElementById('random-button').addEventListener('click', () => {
        const array = getEmojiArray(emojiListTextarea.value);
        if (array.length == 0) {
            return;
        }

        const emoji = array[Math.floor(Math.random() * array.length)];
        addToWorld(engine, emoji, fontInput.value, 400);
    });

    document.getElementById('clear-button').addEventListener('click', () => {
        const count = engine.world.bodies.length - initialBodiesLength;
        for (let i = 0; i < count; i++) {
            let body = engine.world.bodies[initialBodiesLength];
            Matter.Composite.removeBody(engine.world, body);
        }
    });
})();