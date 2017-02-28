"use strict";

var gulp = require("gulp");
var run = require('gulp-run');

gulp.task('bundle-js', function () {
    var cmd = new run.Command('jspm build src/main.js public/assets/js/build.js --minify --skip-source-maps');
    cmd.exec();
});

gulp.task('build-debug-js', function () {
    var cmd = new run.Command('jspm build src/main.js public/assets/js/build.js --skip-source-maps');
    cmd.exec();
});

gulp.task('copy-css', function () {
    return gulp.src('assets/css/**/*')
        .pipe(gulp.dest('public/assets/css'));
});

gulp.task('copy-font', function () {
    return gulp.src('assets/font/**/*')
        .pipe(gulp.dest('public/assets/font'));
});

gulp.task('copy-images', function () {
    return gulp.src('assets/images/**/*')
        .pipe(gulp.dest('public/assets/images'));
});

gulp.task('copy-lib', function () {
    gulp.src('assets/lib/jquery/**/*')
        .pipe(gulp.dest('public/assets/lib/jquery/'));

    gulp.src('assets/lib/uikit-2.26.4/**/*')
        .pipe(gulp.dest('public/assets/lib/uikit-2.26.4/'));
});

gulp.task('copy-rs', ['copy-css', 'copy-images', 'copy-lib', 'copy-font']);

gulp.task('andaman', buildAndamanFile);

gulp.task('build-debug', ['copy-rs', 'build-debug-js']);
gulp.task('default', ['copy-rs', 'bundle-js']);

gulp.task('watch-andaman', function() {
    gulp.watch('src/services/andaman.js', buildAndamanFile);
});

function buildAndamanFile() {
    var cmd = new run.Command('browserify src/services/andaman.js -o src/services/andaman-service.js --standalone AndamanService');
    cmd.exec();
}