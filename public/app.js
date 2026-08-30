/* 화면별 동작. 프레임워크 없음. 각 블록은 해당 요소가 있을 때만 실행된다. */
(function () {
  'use strict';

  var post = function (url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  };

  /* ── SC-02 업로드 ─────────────────────────────────────── */
  var form = document.getElementById('upload-form');
  if (form) {
    var limits = window.__UPLOAD_LIMITS;
    var fileInput = document.getElementById('video');
    var consent = document.getElementById('consent');
    var submitBtn = document.getElementById('submit-btn');
    var status = document.getElementById('upload-status');
    var fileError = null;

    var setError = function (id, message) {
      var el = document.getElementById(id);
      if (el) el.textContent = message || '';
    };

    var syncSubmit = function () {
      // 동의 전에는 버튼을 열지 않는다 (브리프 §3 SC-02).
      submitBtn.disabled = !consent.checked || Boolean(fileError);
    };

    // 제약은 올리기 전에 잡는다. 올린 뒤 거절하면 이탈률이 크게 오른다.
    fileInput.addEventListener('change', function () {
      fileError = null;
      setError('err-video', '');
      var file = fileInput.files && fileInput.files[0];
      if (!file) { syncSubmit(); return; }

      var name = file.name.toLowerCase();
      var extOk = limits.allowedExtensions.some(function (ext) { return name.endsWith(ext); });
      if (!extOk) {
        fileError = 'EXT_NOT_ALLOWED';
        setError('err-video', limits.allowedExtensions.join(', ') + ' 파일만 올릴 수 있습니다.');
      } else if (file.size > limits.maxBytes) {
        fileError = 'TOO_LARGE';
        setError('err-video', Math.round(file.size / 1048576) + 'MB 입니다. '
          + Math.round(limits.maxBytes / 1048576) + 'MB 이하만 올릴 수 있습니다. 사고 전후 구간만 잘라서 올려 주세요.');
      }
      if (fileError) {
        post('/api/events', { name: 'unsupported_file', reason: fileError, stage: 'client' });
        syncSubmit();
        return;
      }

      // 재생 시간은 메타데이터만 읽어 확인한다.
      var probe = document.createElement('video');
      probe.preload = 'metadata';
      var url = URL.createObjectURL(file);
      probe.onloadedmetadata = function () {
        URL.revokeObjectURL(url);
        if (probe.duration && probe.duration > limits.maxDurationSeconds) {
          fileError = 'TOO_LONG';
          setError('err-video', Math.round(probe.duration) + '초 입니다. '
            + limits.maxDurationSeconds + '초 이하만 분석할 수 있습니다. 속도가 쟁점인 구간만 잘라서 올려 주세요.');
          post('/api/events', { name: 'unsupported_file', reason: 'TOO_LONG', stage: 'client' });
        } else if (probe.duration) {
          setError('err-video', '');
          status.textContent = Math.round(probe.duration) + '초 · '
            + Math.round(file.size / 1048576) + 'MB';
        }
        syncSubmit();
      };
      probe.onerror = function () {
        URL.revokeObjectURL(url);
        // 브라우저가 못 읽어도 서버가 다시 본다. 여기서 막지는 않는다.
        syncSubmit();
      };
      probe.src = url;
      syncSubmit();
    });

    consent.addEventListener('change', syncSubmit);

    form.addEventListener('submit', function (e) {
      var email = document.getElementById('email');
      var purpose = form.querySelector('input[name=purpose]:checked');
      var ok = true;
      setError('err-email', '');
      setError('err-purpose', '');
      setError('err-consent', '');

      if (!fileInput.files || !fileInput.files[0]) { setError('err-video', '영상 파일을 선택해 주세요.'); ok = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { setError('err-email', '이메일 형식을 확인해 주세요.'); ok = false; }
      if (!purpose) { setError('err-purpose', '사용 용도를 선택해 주세요.'); ok = false; }
      if (!consent.checked) { setError('err-consent', '정책에 동의해 주세요.'); ok = false; }
      if (fileError) ok = false;

      if (!ok) { e.preventDefault(); return; }

      post('/api/events', {
        name: 'upload_start',
        purpose: purpose.value,
        sizeBytes: fileInput.files[0].size,
      });
      submitBtn.disabled = true;
      submitBtn.textContent = '올리는 중…';
      status.textContent = '창을 닫지 마세요. 업로드가 끝나면 자동으로 이동합니다.';
    });

    syncSubmit();
  }

  /* ── SC-03 진행 폴링 ──────────────────────────────────── */
  var jobCard = document.getElementById('job-card');
  if (jobCard) {
    var token = jobCard.dataset.token;
    var note = document.getElementById('job-note');
    var poll = function () {
      fetch('/api/jobs/' + encodeURIComponent(token))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data) return;
          if (data.status === 'done' && data.resultUrl) { location.href = data.resultUrl; return; }
          if (data.status === 'failed') { location.reload(); return; }
          if (data.status === 'running' && note) note.textContent = '분석 중입니다.';
          setTimeout(poll, 3000);
        })
        .catch(function () { setTimeout(poll, 8000); });
    };
    setTimeout(poll, 3000);
  }

  /* ── SC-04 정확도 피드백 ──────────────────────────────── */
  var fbCard = document.getElementById('feedback-card');
  var fbForm = document.getElementById('feedback-form');
  if (fbCard && fbForm) {
    var fbToken = fbCard.dataset.token;
    var actualField = document.getElementById('actual-field');
    var fbStatus = document.getElementById('fb-status');

    fbForm.querySelectorAll('button[data-answer]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.answer === 'no') {
          // '아니오'일 때만 실제 속도 입력을 연다.
          actualField.classList.remove('hidden');
          document.getElementById('actual_kmh').focus();
          return;
        }
        post('/api/results/' + encodeURIComponent(fbToken) + '/feedback', { isAccurate: true })
          .then(function () { fbStatus.textContent = '의견 주셔서 감사합니다.'; fbForm.querySelector('.actions').remove(); });
      });
    });

    fbForm.addEventListener('submit', function (e) {
      e.preventDefault();
      post('/api/results/' + encodeURIComponent(fbToken) + '/feedback', {
        isAccurate: false,
        actualKmh: document.getElementById('actual_kmh').value,
        note: document.getElementById('fb-note').value,
      }).then(function () {
        fbStatus.textContent = '알려주셔서 감사합니다. 모델 검증에 사용합니다.';
        actualField.classList.add('hidden');
        var actions = fbForm.querySelector('.actions');
        if (actions) actions.remove();
      });
    });
  }

  /* ── SC-05 전문가 검토 (fake door) ────────────────────── */
  var reviewBtn = document.getElementById('review-btn');
  var reviewDialog = document.getElementById('review-dialog');
  if (reviewBtn && reviewDialog && fbCard) {
    var rToken = fbCard.dataset.token;
    reviewBtn.addEventListener('click', function () {
      post('/api/results/' + encodeURIComponent(rToken) + '/paywall-open');
      reviewDialog.showModal();
    });
    document.getElementById('review-close').addEventListener('click', function () { reviewDialog.close(); });
    document.getElementById('review-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('review-status');
      post('/api/results/' + encodeURIComponent(rToken) + '/review-interest', {
        email: document.getElementById('review-email').value,
      }).then(function (r) {
        status.textContent = r.ok ? '출시되면 알려드리겠습니다.' : '이메일 형식을 확인해 주세요.';
      });
    });
  }

  /* ── SC-06 기종 수집 ──────────────────────────────────── */
  var deviceCard = document.getElementById('device-card');
  var deviceForm = document.getElementById('device-form');
  if (deviceCard && deviceForm) {
    deviceForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = document.getElementById('device-status');
      post('/api/device-reports', {
        device: document.getElementById('device').value,
        note: document.getElementById('device-note').value,
        email: document.getElementById('device-email').value,
        failureCode: deviceCard.dataset.failure,
      }).then(function (r) {
        if (!r.ok) { status.textContent = '기종을 입력해 주세요.'; return; }
        status.textContent = '보내주셔서 감사합니다. 지원 목록에 반영합니다.';
        deviceForm.querySelector('.btn').disabled = true;
      });
    });
  }
})();
