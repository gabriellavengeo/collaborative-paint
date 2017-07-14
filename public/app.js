"use strict";

(function () {
    var socket = io.connect('http://localhost:3000');

    function switchView (view) {
        $('.view').each(function (index, el) {
            if ($(el).hasClass(view)) {
                $(el).removeClass('hide');
            } else {
                $(el).addClass('hide');
            }
        });
    }

    // Open a new drawing session
    $('#new').click(function () {
        var name = prompt("Name of your drawing session:");
        if (name !== undefined) {
            socket.emit('createRoom', {name: name});
            switchView('canvas');
            $('#title').html(name);
        }
    });

    // Join a drawing session
    $('#sessions-list').click(function (e) {
        if ($(e.target).hasClass('join-room')) {
            socket.emit('join', e.target.dataset.room);
            switchView('canvas');
            $('#title').html(e.target.dataset.name);
        }
    });

    // Add a drawing session to list
    function listSession (data) {
        $('#sessions-list').append('<li>#' + data.index + ' ' + data.name + 
        ' <button class="join-room" data-room="' + data.room + '" data-name="' 
        + data.name + '">Join</button></li>');
    }

    socket.on('newSession', function (data) {
        listSession(data);
    });

    // List all saved/active drawing sessions
    socket.on('sessions', function (data) {
        for (var i in data) {
            listSession(data[i]);
        }
    });

    socket.on('message', function (msg) {
        alert(msg);
    });

    var canvas = $('#paint')[0];
    var ctx = canvas.getContext('2d');

    var pencil = {
        color: 'white',
        size: 3,
        init: function (canvas, ctx) {
            this.canvas = canvas;
            this.ctx = ctx;
            this.ctx.fillStyle = 'black';
            this.ctx.fillRect(0, 0, canvas.width, canvas.height);
            this.ctx.strokeStyle = this.color;
            this.ctx.lineJoin = "round";
            this.ctx.lineCap = "round";
            this.ctx.lineWidth = this.size;

            // Attach drawing events
            $(this.canvas).on('mousedown', this.onDrawStart.bind(this));
            $(this.canvas).on('mousemove', this.onDraw.bind(this));
            $(this.canvas).on('mouseup', this.onDrawEnd.bind(this));
            $(this.canvas).on('mouseout', this.onDrawEnd.bind(this));
            // Attach image dropping events
            this.canvas.addEventListener('dragover', function (e) { e.preventDefault(); }, false);
            this.canvas.addEventListener('drop', this.onImageDrop.bind(this), false);

            // Change pen color
            $('#colors-ctrl').click(function (e) {
                if(e.target && e.target.dataset.color) {
                    this.ctx.beginPath();
                    this.color = e.target.dataset.color
                    this.ctx.strokeStyle = this.color;
                }
            }.bind(this));

            // Change pen size
            $('#pen-size').change(function (e) {
                this.ctx.beginPath();
                this.size = e.target.value;
                this.ctx.lineWidth = this.size;
            }.bind(this));

            // Clear canvas and undo/redo history
            $('#clear').click(function (e) {
                socket.emit('clear');
            });

            socket.on('clear', function () {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.beginPath();
            });

            // Emit undo event
            $('#undo').click(function (e) {
                socket.emit('undo');
            });

            // Emit redo event
            $('#redo').click(function (e) {
                socket.emit('redo');
            });

            // Save drawing session
            $('#save').click(function (e) {
                socket.emit('save');
            });

            // Exit drawing session and switch to home view
            $('#exit').click(function (e) {
                socket.emit('leave');
                switchView('home');
            });

            // Draw a point from real time update from other drawing session participants
            function drawPoint (data) {
                if(data.color !== ctx.strokeStyle || data.size !== ctx.lineWidth) {
                    ctx.beginPath();
                    ctx.strokeStyle = data.color;
                    ctx.lineWidth = data.size;
                }
                ctx.moveTo(data.prev.x, data.prev.y);
                ctx.lineTo(data.x, data.y);
                ctx.stroke();
            }

            socket.on('point', function (data) {
                drawPoint(data);
            });

            // Redraw canvas
            socket.on('canvas', function (data) {
                if(data !== '') {
                    var img = new Image;
                    img.onload = function(){
                        ctx.drawImage(img,0,0);
                    };
                    img.src = data;
                } else {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.beginPath();
            });
        },
        isDrawing: false,
        updateCoordinates: function (x, y) {
            var rect = this.canvas.getBoundingClientRect();
            this.posX = x - rect.left;
            this.posY = y - rect.top;
        },
        onDrawStart: function (e) {
            this.isDrawing = true;
            this.ctx.beginPath();
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            this.updateCoordinates(e.clientX, e.clientY);
            this.ctx.moveTo(this.posX, this.posY);
        },
        onDraw: function (e) {
            if (this.isDrawing) {
                this.ctx.moveTo(this.posX, this.posY);
                var pointPrev = {
                    x: this.posX,
                    y: this.posY,
                };
                this.updateCoordinates(e.clientX, e.clientY);
                this.ctx.lineTo(this.posX, this.posY);
                this.ctx.stroke();

                var point = {
                    x: this.posX,
                    y: this.posY,
                    color: this.ctx.strokeStyle,
                    size: this.ctx.lineWidth,
                    prev: pointPrev
                };
                socket.emit('point', point);
            }
        },
        onDrawEnd: function (e) {
            if (this.isDrawing) {
                this.isDrawing = false;
                socket.emit('stroke', {"image": this.canvas.toDataURL(), "redraw": false});
            }
        },
        onImageDrop: function (e) {
            var files = e.dataTransfer.files;
            if (files.length > 0) {
                var file = files[0];
                if (typeof FileReader !== "undefined" && file.type.indexOf("image") != -1) {
                    var reader = new FileReader();
                    var that = this;
                    reader.onload = function (e) {
                        var img = new Image;
                        img.onload = function(){
                            ctx.drawImage(img, 0, 0);
                            ctx.beginPath();
                            socket.emit('stroke', {"image": that.canvas.toDataURL(), "redraw": true});
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            }
            e.preventDefault();
        }
    }

    pencil.init(canvas, ctx);

})();
